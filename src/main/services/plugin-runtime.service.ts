import log from 'electron-log'
import { BUILTIN_PLUGINS, PLUGIN_IDS } from '@shared/plugins'
import { normalizeProfilePlugins } from '@shared/upload-profile'
import type {
  PluginManifest,
  PluginProfileStatus,
  PreUploadResult,
  ProfilePluginConfig,
  Task,
  TaskPluginRun,
  WebhookConfig
} from '@shared/types'
import { getPluginRunRepo } from '../db/plugin-run.repo'
import { getSettingsRepo } from '../db/settings.repo'
import { getModule1PreUploadService } from './module1-preupload.service'
import { getWebhookService } from './webhook.service'

type TaskEventName = 'task_completed' | 'task_failed'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizedTaskPlugins(task: Task): ProfilePluginConfig {
  return normalizeProfilePlugins(
    (task.profileSnapshot as unknown as { plugins?: unknown } | null)?.plugins
  )
}

function configForPlugin(plugins: ProfilePluginConfig, pluginId: string): unknown {
  return plugins.configs[pluginId]
}

function webhookConfigFromPlugin(rawConfig: unknown): WebhookConfig | null {
  if (!isRecord(rawConfig)) return null
  return {
    enabled: rawConfig.enabled === true,
    url: typeof rawConfig.url === 'string' ? rawConfig.url : '',
    headers: isRecord(rawConfig.headers)
      ? Object.fromEntries(
        Object.entries(rawConfig.headers).map(([key, value]) => [key, String(value)])
      )
      : {}
  }
}

function summarizeConfig(plugin: PluginManifest, rawConfig: unknown): string {
  if (plugin.id === PLUGIN_IDS.MODULE1_PREUPLOAD) {
    const stationPrefix =
      isRecord(rawConfig) && typeof rawConfig.stationPrefix === 'string'
        ? rawConfig.stationPrefix
        : 'station2'
    return `stationPrefix=${stationPrefix}`
  }
  if (plugin.id === PLUGIN_IDS.WEBHOOK_NOTIFIER) {
    const config = webhookConfigFromPlugin(rawConfig)
    return config?.enabled && config.url ? `已配置 ${config.url}` : '未配置'
  }
  if (plugin.id === PLUGIN_IDS.OSS_BROWSER) {
    return '使用当前 Profile 的阿里云 OSS 配置'
  }
  return ''
}

export class PluginRuntimeService {
  listManifests(): PluginManifest[] {
    return BUILTIN_PLUGINS
  }

  async runPreUploadPlugins(task: Task): Promise<PreUploadResult | null> {
    const plugins = normalizedTaskPlugins(task)
    const enabled = new Set(plugins.enabledPluginIds)
    for (const pluginId of plugins.order) {
      if (pluginId !== PLUGIN_IDS.MODULE1_PREUPLOAD || !enabled.has(pluginId)) continue

      const run = getPluginRunRepo().start(task.id, pluginId, 'preUpload')
      try {
        const result = await getModule1PreUploadService().run(
          task,
          configForPlugin(plugins, pluginId)
        )
        getPluginRunRepo().complete(run.id, {
          summary: result.summary || null,
          stagingPath: result.uploadRootPath,
          artifacts: result.artifacts || null
        })
        return result
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        getPluginRunRepo().fail(run.id, message)
        throw error
      }
    }

    return null
  }

  notifyTaskEvent(task: Task, event: TaskEventName): void {
    const settings = getSettingsRepo()
    const plugins = normalizedTaskPlugins(task)
    const webhookPluginEnabled = plugins.enabledPluginIds.includes(
      PLUGIN_IDS.WEBHOOK_NOTIFIER
    )
    const pluginConfig = webhookConfigFromPlugin(
      configForPlugin(plugins, PLUGIN_IDS.WEBHOOK_NOTIFIER)
    )
    const legacyConfig = settings.get<WebhookConfig>('webhook')
    const config = webhookPluginEnabled ? pluginConfig : legacyConfig
    if (!config?.enabled || !config.url) return

    const run = getPluginRunRepo().start(task.id, PLUGIN_IDS.WEBHOOK_NOTIFIER, 'notification')
    const createdAt = new Date(task.createdAt).getTime()
    const durationSeconds = Number.isFinite(createdAt)
      ? Math.max(0, Math.round((Date.now() - createdAt) / 1000))
      : 0

    void getWebhookService()
      .notify(config, {
        event,
        taskId: task.id,
        folderName: task.folderName,
        fileCount: task.totalFiles,
        totalBytes: task.totalBytes,
        durationSeconds,
        status: event === 'task_completed' ? 'completed' : 'failed',
        timestamp: new Date().toISOString()
      })
      .then(() => {
        getPluginRunRepo().complete(run.id, {
          summary: {
            event,
            url: config.url
          }
        })
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        getPluginRunRepo().fail(run.id, message)
        log.warn('Webhook 插件通知失败:', message)
      })
  }

  getProfileStatus(profileId?: string | null): PluginProfileStatus {
    const settings = getSettingsRepo().getAll()
    const profile =
      settings.profiles.find((item) => item.id === profileId) ||
      settings.profiles.find((item) => item.id === settings.activeProfileId) ||
      settings.profiles[0]
    const plugins = normalizeProfilePlugins(profile.plugins)
    const enabled = new Set(plugins.enabledPluginIds)
    const recentRuns = getPluginRunRepo().listRecent(100)

    return {
      profileId: profile.id,
      profileName: profile.name,
      plugins: BUILTIN_PLUGINS.map((manifest) => ({
        manifest,
        enabled: enabled.has(manifest.id),
        configSummary: summarizeConfig(manifest, plugins.configs[manifest.id]),
        lastRun: this.findLastRun(recentRuns, manifest.id)
      }))
    }
  }

  listTaskRuns(taskId: string): TaskPluginRun[] {
    return getPluginRunRepo().listByTask(taskId)
  }

  private findLastRun(runs: TaskPluginRun[], pluginId: string): TaskPluginRun | null {
    return runs.find((run) => run.pluginId === pluginId) || null
  }
}

let instance: PluginRuntimeService | null = null
export function getPluginRuntimeService(): PluginRuntimeService {
  if (!instance) instance = new PluginRuntimeService()
  return instance
}
