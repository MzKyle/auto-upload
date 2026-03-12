import log from 'electron-log'
import type { WebhookConfig } from '@shared/types'

export interface WebhookPayload {
  event: 'task_completed' | 'task_failed'
  taskId: string
  folderName: string
  fileCount: number
  totalBytes: number
  durationSeconds: number
  status: string
  timestamp: string
}

/**
 * Webhook 通知服务
 * 上传完成/失败后向配置的 URL 发送 POST 请求
 */
export class WebhookService {
  async notify(config: WebhookConfig, payload: WebhookPayload): Promise<void> {
    if (!config.enabled || !config.url) return

    const maxRetries = 3
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(config.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...config.headers
          },
          body: JSON.stringify(payload)
        })

        if (response.ok) {
          log.info(`Webhook 通知成功: ${config.url}`)
          return
        }
        log.warn(`Webhook 响应异常: ${response.status} ${response.statusText}`)
      } catch (err) {
        log.warn(`Webhook 请求失败 (尝试 ${attempt + 1}/${maxRetries + 1}):`, err)
      }

      // 指数退避
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }

    log.error(`Webhook 通知最终失败: ${config.url}`)
  }
}

let instance: WebhookService | null = null
export function getWebhookService(): WebhookService {
  if (!instance) instance = new WebhookService()
  return instance
}
