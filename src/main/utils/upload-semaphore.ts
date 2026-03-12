/**
 * 全局上传并发信号量
 * 限制跨任务的并发上传文件总数，防止过多并发耗尽系统资源
 */
export class UploadSemaphore {
  private current = 0
  private waiting: Array<{ resolve: () => void; id: symbol }> = []

  constructor(private max: number) { }

  setMax(max: number): void {
    this.max = max
    // 如果新上限更高，唤醒等待者
    this.drain()
  }

  getMax(): number {
    return this.max
  }

  getCurrent(): number {
    return this.current
  }

  async acquire(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      throw new DOMException('Semaphore acquire aborted', 'AbortError')
    }

    if (this.current < this.max) {
      this.current++
      return
    }

    return new Promise<void>((resolve, reject) => {
      const id = Symbol()

      const entry = {
        resolve: () => {
          this.current++
          cleanup()
          resolve()
        },
        id
      }

      const onAbort = (): void => {
        // 从等待队列中移除（未获取许可，不递增 current）
        const idx = this.waiting.findIndex((w) => w.id === id)
        if (idx !== -1) this.waiting.splice(idx, 1)
        cleanup()
        reject(new DOMException('Semaphore acquire aborted', 'AbortError'))
      }

      const cleanup = (): void => {
        signal?.removeEventListener('abort', onAbort)
      }

      signal?.addEventListener('abort', onAbort, { once: true })
      this.waiting.push(entry)
    })
  }

  release(): void {
    this.current--
    this.drain()
  }

  private drain(): void {
    while (this.waiting.length > 0 && this.current < this.max) {
      const next = this.waiting.shift()!
      next.resolve()
    }
  }
}

let instance: UploadSemaphore | null = null

export function getUploadSemaphore(max?: number): UploadSemaphore {
  if (!instance) {
    instance = new UploadSemaphore(max ?? 30)
  } else if (max !== undefined) {
    instance.setMax(max)
  }
  return instance
}
