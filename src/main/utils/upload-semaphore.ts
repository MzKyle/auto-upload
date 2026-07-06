/**
 * 全局上传并发信号量
 * 限制跨任务的并发上传文件总数，防止过多并发耗尽系统资源
 */
export class UploadSemaphore {
  private current = 0
  private waiting: Array<{ resolve: () => void; id: symbol; weight: number }> = []

  constructor(private max: number) {
    this.max = this.normalizeMax(max)
  }

  setMax(max: number): void {
    this.max = this.normalizeMax(max)
    for (const entry of this.waiting) {
      entry.weight = Math.min(entry.weight, this.max)
    }
    // 如果新上限更高，唤醒等待者
    this.drain()
  }

  getMax(): number {
    return this.max
  }

  getCurrent(): number {
    return this.current
  }

  async acquire(signal?: AbortSignal, weight = 1): Promise<void> {
    if (signal?.aborted) {
      throw new DOMException('Semaphore acquire aborted', 'AbortError')
    }
    const effectiveWeight = this.normalizeAcquireWeight(weight)

    if (
      this.waiting.length === 0 &&
      this.current + effectiveWeight <= this.max
    ) {
      this.current += effectiveWeight
      return
    }

    return new Promise<void>((resolve, reject) => {
      const id = Symbol()

      const entry = {
        resolve: () => {
          this.current += entry.weight
          cleanup()
          resolve()
        },
        id,
        weight: effectiveWeight
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
      this.drain()
    })
  }

  release(weight = 1): void {
    this.current = Math.max(0, this.current - this.normalizeReleaseWeight(weight))
    this.drain()
  }

  private drain(): void {
    while (this.waiting.length > 0) {
      const next = this.waiting[0]
      next.weight = Math.min(next.weight, this.max)
      if (this.current + next.weight > this.max) return
      this.waiting.shift()
      next.resolve()
    }
  }

  private normalizeMax(max: number): number {
    return Math.max(1, Math.floor(max || 1))
  }

  private normalizeAcquireWeight(weight: number): number {
    return Math.max(1, Math.min(this.normalizeReleaseWeight(weight), this.max))
  }

  private normalizeReleaseWeight(weight: number): number {
    return Math.max(1, Math.floor(weight || 1))
  }
}

let instance: UploadSemaphore | null = null

export function getUploadSemaphore(max?: number): UploadSemaphore {
  if (!instance) {
    instance = new UploadSemaphore(max ?? 12)
  } else if (max !== undefined) {
    instance.setMax(max)
  }
  return instance
}
