import { createReadStream } from 'fs'
import log from 'electron-log'
import type { AppSettings } from '@shared/types'

// ali-oss 类型
interface OSSClient {
  put: (key: string, stream: NodeJS.ReadableStream | Buffer) => Promise<{ res: { status: number } }>
  multipartUpload: (
    key: string,
    filePath: string,
    options?: {
      checkpoint?: unknown
      partSize?: number
      progress?: (percentage: number, checkpoint: unknown) => void
    }
  ) => Promise<{ res: { status: number } }>
  cancel: () => void
}

export class OSSUploadService {
  private client: OSSClient | null = null
  private config: AppSettings['oss'] | null = null
  private multipartThreshold: number = 100 * 1024 * 1024 // 100MB

  configure(config: AppSettings['oss'], multipartThreshold?: number): void {
    this.config = config
    if (multipartThreshold) this.multipartThreshold = multipartThreshold
    this.client = null // 重新配置时重建客户端
  }

  private async getClient(): Promise<OSSClient> {
    if (this.client) return this.client
    if (!this.config) throw new Error('OSS 未配置')

    const OSS = (await import('ali-oss')).default
    this.client = new OSS({
      region: this.config.region,
      accessKeyId: this.config.accessKeyId,
      accessKeySecret: this.config.accessKeySecret,
      bucket: this.config.bucket,
      endpoint: this.config.endpoint || undefined
    }) as unknown as OSSClient

    return this.client
  }

  /**
   * 创建任务级独立 OSS 客户端
   * 每个任务使用自己的客户端，cancel() 不会影响其他任务
   */
  async createTaskClient(): Promise<OSSClient> {
    if (!this.config) throw new Error('OSS 未配置')

    const OSS = (await import('ali-oss')).default
    return new OSS({
      region: this.config.region,
      accessKeyId: this.config.accessKeyId,
      accessKeySecret: this.config.accessKeySecret,
      bucket: this.config.bucket,
      endpoint: this.config.endpoint || undefined
    }) as unknown as OSSClient
  }

  /**
   * 上传单个文件到 OSS
   * @param filePath 本地文件绝对路径
   * @param ossKey OSS 对象 key
   * @param fileSize 文件大小
   * @param onProgress 进度回调 (0-1)
   * @param signal 取消信号
   * @param taskClient 任务级 OSS 客户端（可选，默认使用共享客户端）
   * @returns OSS key
   */
  async uploadFile(
    filePath: string,
    ossKey: string,
    fileSize: number,
    onProgress?: (fraction: number) => void,
    signal?: AbortSignal,
    taskClient?: OSSClient
  ): Promise<string> {
    if (signal?.aborted) {
      throw new DOMException('Upload aborted', 'AbortError')
    }

    const client = taskClient || (await this.getClient())

    if (fileSize > this.multipartThreshold) {
      // 分片上传
      try {
        await client.multipartUpload(ossKey, filePath, {
          partSize: 1024 * 1024, // 1MB 分片
          progress: (percentage: number) => {
            onProgress?.(percentage)
          }
        })
      } catch (err: unknown) {
        // ali-oss cancel() 触发的错误
        if (signal?.aborted || (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'cancel')) {
          throw new DOMException('Upload aborted', 'AbortError')
        }
        throw err
      }
    } else {
      // 普通流式上传
      const stream = createReadStream(filePath)

      const onAbort = (): void => {
        stream.destroy()
      }
      signal?.addEventListener('abort', onAbort, { once: true })

      try {
        await client.put(ossKey, stream)
        onProgress?.(1)
      } catch (err) {
        if (signal?.aborted) {
          throw new DOMException('Upload aborted', 'AbortError')
        }
        throw err
      } finally {
        signal?.removeEventListener('abort', onAbort)
        stream.destroy()
      }
    }

    return ossKey
  }

  /**
   * 上传 Buffer 到 OSS（用于 SFTP 直传场景）
   */
  async uploadBuffer(buffer: Buffer, ossKey: string): Promise<string> {
    const client = await this.getClient()
    await client.put(ossKey, buffer)
    return ossKey
  }

  async testConnection(config: AppSettings['oss']): Promise<{ ok: boolean; error?: string }> {
    try {
      const OSS = (await import('ali-oss')).default
      const client = new OSS({
        region: config.region,
        accessKeyId: config.accessKeyId,
        accessKeySecret: config.accessKeySecret,
        bucket: config.bucket,
        endpoint: config.endpoint || undefined
      })
      await (client as unknown as { listBuckets: (opts: Record<string, never>) => Promise<unknown> }).listBuckets({})
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  }
}

let instance: OSSUploadService | null = null
export function getOSSUploadService(): OSSUploadService {
  if (!instance) instance = new OSSUploadService()
  return instance
}
