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
  private readonly defaultStartAfterTime = '20:30'
  private readonly defaultEndBeforeTime = '23:59'
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
    if (!this.isWithinUploadWindow(uploadConfig?.startAfterTime, uploadConfig?.endBeforeTime)) return

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

  private isWithinUploadWindow(startAfterTime?: string, endBeforeTime?: string): boolean {
    const normalizedStart = this.normalizeTime(startAfterTime, this.defaultStartAfterTime)
    const normalizedEnd = this.normalizeTime(endBeforeTime, this.defaultEndBeforeTime)
    const startMinutes = this.timeToMinutes(normalizedStart)
    const endMinutes = this.timeToMinutes(normalizedEnd)
    const now = new Date()
    const currentMinutes = now.getHours() * 60 + now.getMinutes()

    // 开始时间 == 结束时间：视为全天可上传
    if (startMinutes === endMinutes) return true

    // 普通区间：例如 08:00 - 20:30
    if (startMinutes < endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes
    }

    // 跨午夜区间：例如 20:30 - 06:00
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes
  }

  private timeToMinutes(time: string): number {
    const [hour, minute] = time.split(':').map(Number)
    return hour * 60 + minute
  }

  private normalizeTime(time: string | undefined, fallback: string): string {
    if (!time) return fallback
    const match = time.match(/^(\d{1,2}):(\d{1,2})$/)
    if (!match) return fallback
    const hour = Number(match[1])
    const minute = Number(match[2])
    if (Number.isNaN(hour) || Number.isNaN(minute)) return fallback
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  }
}

let instance: TaskQueueService | null = null
export function getTaskQueueService(): TaskQueueService {
  if (!instance) instance = new TaskQueueService()
  return instance
}
