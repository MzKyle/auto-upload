import { join } from 'path'
import log from 'electron-log'
import { BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { getTaskRepo } from '../db/task.repo'
import { getSettingsRepo } from '../db/settings.repo'
import { getOSSUploadService } from './oss-upload.service'
import { FileFilterService } from './file-filter.service'
import { writeProcessTask } from '../utils/marker-file'
import { SpeedCalculator } from '../utils/speed-calculator'
import { getUploadSemaphore } from '../utils/upload-semaphore'
import type { Task, TaskProgress, ProcessTaskMarker, FilterRules, UploadConfig } from '@shared/types'

/**
 * 任务执行器
 * 处理单个文件夹的完整上传流程：扫描 → 过滤 → 上传 → 更新标记
 */
export class TaskRunnerService {
  /**
   * 执行一个文件夹上传任务
   */
  async run(task: Task, signal?: AbortSignal): Promise<void> {
    const taskRepo = getTaskRepo()
    const settings = getSettingsRepo()

    // 获取过滤规则
    const filterRules = settings.get<FilterRules>('filter') || {
      whitelist: [], blacklist: [], regex: [],
      suffixes: ['.jpg', '.jpeg', '.png', '.csv', '.json', '.log', '.txt']
    }
    const filter = new FileFilterService(filterRules)

    // 获取上传配置
    const uploadConfig = settings.get<UploadConfig>('upload')
    const maxFilesPerTask = uploadConfig?.maxFilesPerTask || 6

    // 初始化全局并发信号量（上限来自配置）
    const semaphore = getUploadSemaphore(uploadConfig?.maxConcurrentUploads || 30)

    // 配置 OSS
    const ossConfig = settings.get<Task['ossPrefix'] extends string ? { endpoint: string; bucket: string; region: string; prefix: string; accessKeyId: string; accessKeySecret: string } : never>('oss')
    if (!ossConfig || !ossConfig.accessKeyId) {
      throw new Error('OSS 未配置，请在设置中配置阿里云 OSS 信息')
    }
    const ossService = getOSSUploadService()
    ossService.configure(ossConfig, uploadConfig?.multipartThreshold)

    // 创建任务级独立 OSS 客户端，cancel() 只影响当前任务
    const taskClient = await ossService.createTaskClient()
    signal?.addEventListener('abort', () => { taskClient.cancel() }, { once: true })

    // 1. 扫描文件
    if (signal?.aborted) throw new DOMException('Upload cancelled', 'AbortError')
    taskRepo.updateStatus(task.id, 'scanning')
    const files = filter.scanFolder(task.folderPath)
    log.info(`任务 ${task.id}: 扫描到 ${files.length} 个文件`)

    if (files.length === 0) {
      log.info(`任务 ${task.id}: 无需上传的文件`)
      return
    }

    // 2. 注册文件到数据库
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0)
    taskRepo.setTotals(task.id, files.length, totalBytes)

    // 检查已有记录（用于断点续传）
    const existingFiles = taskRepo.listFiles(task.id)
    const existingPaths = new Set(existingFiles.map((f) => f.relativePath))

    const newFiles = files.filter((f) => !existingPaths.has(f.relativePath))
    if (newFiles.length > 0) {
      taskRepo.bulkCreateFiles(
        task.id,
        newFiles.map((f) => ({ relativePath: f.relativePath, fileSize: f.size }))
      )
    }

    // 3. 获取待上传文件列表（包含被中断时停留在 uploading 状态的文件）
    const pendingFiles = taskRepo.listFiles(task.id, 'pending')
    const failedFiles = taskRepo.listFiles(task.id, 'failed')
    const uploadingFiles = taskRepo.listFiles(task.id, 'uploading')
    const toUpload = [...uploadingFiles, ...pendingFiles, ...failedFiles]

    // 已上传数
    const completedFiles = taskRepo.listFiles(task.id, 'completed')
    let uploadedCount = completedFiles.length
    let uploadedBytes = completedFiles.reduce((sum, f) => sum + f.fileSize, 0)

    // 更新状态
    taskRepo.updateStatus(task.id, 'uploading')
    taskRepo.updateProgress(task.id, uploadedCount, uploadedBytes)

    // 构建 process_task.json
    const processMarker: ProcessTaskMarker = {
      version: 1,
      taskId: task.id,
      status: 'uploading',
      totalFiles: files.length,
      uploadedFiles: uploadedCount,
      files: {},
      lastUpdated: new Date().toISOString(),
      error: null
    }
    for (const f of completedFiles) processMarker.files[f.relativePath] = 'completed'
    for (const f of toUpload) processMarker.files[f.relativePath] = 'pending'

    // 4. 并发上传
    const speedCalc = new SpeedCalculator()
    const ossPrefix = ossConfig.prefix || ''
    const folderName = task.folderName

    const broadcastProgress = (currentFile: string | null) => {
      const progress: TaskProgress = {
        taskId: task.id,
        uploadedFiles: uploadedCount,
        totalFiles: files.length,
        uploadedBytes,
        totalBytes,
        speed: speedCalc.getSpeed(),
        currentFile
      }
      // 广播到所有渲染窗口
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send(IPC.TASK_PROGRESS, progress)
      }
    }

    // 使用 promise 池控制并发
    let idx = 0
    const pool: Promise<void>[] = []

    const uploadNext = async (): Promise<void> => {
      while (idx < toUpload.length && !signal?.aborted) {
        const file = toUpload[idx++]

        const ossKey = join(ossPrefix, folderName, file.relativePath).replace(/\\/g, '/')
        const localPath = join(task.folderPath, file.relativePath)

        // 获取全局并发许可（可被 abort 中断）
        let acquired = false
        try {
          await semaphore.acquire(signal)
          acquired = true

          taskRepo.updateFileStatus(file.id, 'uploading')
          processMarker.files[file.relativePath] = 'uploading'
          broadcastProgress(file.relativePath)

          await ossService.uploadFile(localPath, ossKey, file.fileSize, (fraction) => {
            const bytesDone = Math.round(file.fileSize * fraction)
            speedCalc.addSample(bytesDone)
            broadcastProgress(file.relativePath)
          }, signal, taskClient)

          taskRepo.updateFileStatus(file.id, 'completed', ossKey)
          processMarker.files[file.relativePath] = 'completed'
          uploadedCount++
          uploadedBytes += file.fileSize
          taskRepo.updateProgress(task.id, uploadedCount, uploadedBytes)

          // 定期写入 process_task.json
          processMarker.uploadedFiles = uploadedCount
          processMarker.lastUpdated = new Date().toISOString()
          if (uploadedCount % 10 === 0 || uploadedCount === files.length) {
            writeProcessTask(task.folderPath, processMarker)
          }

          broadcastProgress(null)
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            // 被取消：将当前文件回退为 pending（而非 failed），以便恢复时重传
            taskRepo.updateFileStatus(file.id, 'pending')
            processMarker.files[file.relativePath] = 'pending'
            break
          }
          const errMsg = err instanceof Error ? err.message : String(err)
          taskRepo.updateFileStatus(file.id, 'failed', undefined, undefined, errMsg)
          processMarker.files[file.relativePath] = 'failed'
          log.error(`上传失败: ${file.relativePath}`, errMsg)
        } finally {
          if (acquired) semaphore.release()
        }
      }
    }

    // 启动并发工作者
    for (let i = 0; i < maxFilesPerTask; i++) {
      pool.push(uploadNext())
    }
    await Promise.all(pool)

    // 5. 写入最终标记
    // 如果被中止，跳过失败检查，让上层处理状态
    if (signal?.aborted) {
      processMarker.status = 'paused'
      processMarker.lastUpdated = new Date().toISOString()
      writeProcessTask(task.folderPath, processMarker)
      return
    }

    const finalFailedFiles = taskRepo.listFiles(task.id, 'failed')
    if (finalFailedFiles.length > 0) {
      processMarker.status = 'failed'
      processMarker.error = `${finalFailedFiles.length} 个文件上传失败`
      writeProcessTask(task.folderPath, processMarker)
      throw new Error(`${finalFailedFiles.length} 个文件上传失败`)
    }

    processMarker.status = 'completed'
    processMarker.lastUpdated = new Date().toISOString()
    writeProcessTask(task.folderPath, processMarker)
  }
}

let instance: TaskRunnerService | null = null
export function getTaskRunnerService(): TaskRunnerService {
  if (!instance) instance = new TaskRunnerService()
  return instance
}
