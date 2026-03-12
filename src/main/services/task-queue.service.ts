import { EventEmitter } from 'events'
import log from 'electron-log'
import { getTaskRepo } from '../db/task.repo'
import { getSettingsRepo } from '../db/settings.repo'
import type { Task, TaskStatus, UploadConfig } from '@shared/types'

/**
 * 任务队列服务
 * - 维护有限并发的任务执行池
 * - 状态机管理：pending → scanning → uploading → completed / failed
 */
export class TaskQueueService extends EventEmitter {
  private runningTasks: Map<string, { cancel: () => void }> = new Map()
  private processTimer: ReturnType<typeof setInterval> | null = null
  private taskRunner: ((task: Task, signal: AbortSignal) => Promise<void>) | null = null

  setTaskRunner(runner: (task: Task, signal: AbortSignal) => Promise<void>): void {
    this.taskRunner = runner
  }

  start(): void {
    // 每 2 秒检查一次队列
    this.processTimer = setInterval(() => this.processQueue(), 2000)
    // 启动时立即处理
    this.processQueue()
    log.info('任务队列已启动')
  }

  stop(): void {
    if (this.processTimer) {
      clearInterval(this.processTimer)
      this.processTimer = null
    }
    log.info('任务队列已停止')
  }

  getRunningCount(): number {
    return this.runningTasks.size
  }

  isTaskRunning(taskId: string): boolean {
    return this.runningTasks.has(taskId)
  }

  cancelRunningTask(taskId: string): void {
    const running = this.runningTasks.get(taskId)
    if (running) {
      running.cancel()
      this.runningTasks.delete(taskId)
    }
  }

  private async processQueue(): Promise<void> {
    if (!this.taskRunner) return

    const settings = getSettingsRepo()
    const uploadConfig = settings.get<UploadConfig>('upload')
    const maxConcurrent = uploadConfig?.maxConcurrentTasks || 5

    const taskRepo = getTaskRepo()
    const availableSlots = maxConcurrent - this.runningTasks.size
    if (availableSlots <= 0) return

    const pendingTasks = taskRepo.listByStatus('pending')
    const toRun = pendingTasks.slice(0, availableSlots)

    for (const task of toRun) {
      this.executeTask(task)
    }
  }

  private async executeTask(task: Task): Promise<void> {
    const taskRepo = getTaskRepo()
    const controller = new AbortController()

    this.runningTasks.set(task.id, { cancel: () => controller.abort() })

    try {
      taskRepo.updateStatus(task.id, 'uploading')
      this.emit('task:status-change', {
        taskId: task.id,
        oldStatus: task.status,
        newStatus: 'uploading'
      })

      await this.taskRunner!(task, controller.signal)

      if (!controller.signal.aborted) {
        taskRepo.updateStatus(task.id, 'completed')
        this.emit('task:status-change', {
          taskId: task.id,
          oldStatus: 'uploading',
          newStatus: 'completed'
        })
        log.info('任务完成:', task.folderPath)
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        const errMsg = err instanceof Error ? err.message : String(err)
        taskRepo.updateStatus(task.id, 'failed', errMsg)
        this.emit('task:status-change', {
          taskId: task.id,
          oldStatus: 'uploading',
          newStatus: 'failed'
        })
        log.error('任务失败:', task.folderPath, errMsg)
      }
    } finally {
      this.runningTasks.delete(task.id)
    }
  }
}

let instance: TaskQueueService | null = null
export function getTaskQueueService(): TaskQueueService {
  if (!instance) instance = new TaskQueueService()
  return instance
}
