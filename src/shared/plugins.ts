import type { PluginManifest, ProfilePluginConfig } from './types'

export const PLUGIN_IDS = {
  MODULE1_PREUPLOAD: 'module1-preupload',
  WEBHOOK_NOTIFIER: 'webhook-notifier',
  OSS_BROWSER: 'oss-browser'
} as const

export const BUILTIN_PLUGINS: PluginManifest[] = [
  {
    id: PLUGIN_IDS.MODULE1_PREUPLOAD,
    name: 'Module1 上传前处理',
    version: '1.0.0',
    category: 'preUpload',
    description: '在上传前复制数据目录并按 SANY Module1 规则清理、分类和生成对象 Key。'
  },
  {
    id: PLUGIN_IDS.WEBHOOK_NOTIFIER,
    name: 'Webhook 通知',
    version: '1.0.0',
    category: 'notification',
    description: '任务完成或失败后向配置的 HTTP Webhook 发送通知。'
  },
  {
    id: PLUGIN_IDS.OSS_BROWSER,
    name: 'OSS 浏览器',
    version: '1.0.0',
    category: 'tool',
    description: '使用当前 Profile 的阿里云 OSS 配置只读浏览对象并预览图片。'
  }
]

export const DEFAULT_PROFILE_PLUGINS: ProfilePluginConfig = {
  enabledPluginIds: [],
  order: [
    PLUGIN_IDS.MODULE1_PREUPLOAD,
    PLUGIN_IDS.WEBHOOK_NOTIFIER,
    PLUGIN_IDS.OSS_BROWSER
  ],
  configs: {
    [PLUGIN_IDS.MODULE1_PREUPLOAD]: {
      stationPrefix: 'station2'
    },
    [PLUGIN_IDS.WEBHOOK_NOTIFIER]: {
      url: '',
      headers: {},
      enabled: false
    },
    [PLUGIN_IDS.OSS_BROWSER]: {
      enabled: false
    }
  }
}

const BUILTIN_PLUGIN_ID_SET = new Set(BUILTIN_PLUGINS.map((plugin) => plugin.id))

export function isBuiltinPluginId(id: string): boolean {
  return BUILTIN_PLUGIN_ID_SET.has(id)
}
