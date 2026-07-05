import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExternalLink, Plug, Power, PowerOff, RefreshCw, Settings } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { showToast } from '@/components/ui/toast'
import { fetchProjectCapabilityStatus, fetchSettings, saveSettings } from '@/lib/ipc-client'
import { providersForMode } from '@shared/cloud-upload'
import { DEFAULT_PROFILE_EXTENSIONS, EXTENSION_IDS } from '@shared/plugins'
import type { AppSettings, ProjectCapabilityStatus } from '@shared/types'

function formatTime(value: string | null): string {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('zh-CN', { hour12: false })
}

function categoryLabel(category: string): string {
  if (category === 'pipeline') return '上传流程'
  if (category === 'notification') return '通知'
  if (category === 'tool') return '工具'
  return category
}

function statusVariant(status?: string): 'success' | 'warning' | 'destructive' | 'secondary' {
  if (status === 'completed') return 'success'
  if (status === 'running' || status === 'pending') return 'warning'
  if (status === 'failed') return 'destructive'
  return 'secondary'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function ossConfigComplete(settings: AppSettings | null): boolean {
  return Boolean(
    settings?.oss.region &&
    settings.oss.bucket &&
    settings.oss.accessKeyId &&
    settings.oss.accessKeySecret
  )
}

export default function Plugins() {
  const navigate = useNavigate()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [profileId, setProfileId] = useState('')
  const [status, setStatus] = useState<ProjectCapabilityStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [savingExtensionId, setSavingExtensionId] = useState<string | null>(null)

  const profiles = useMemo(() => settings?.profiles || [], [settings])
  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === profileId) || profiles[0],
    [profileId, profiles]
  )
  const selectedProfileHasAliyun = useMemo(
    () => selectedProfile ? providersForMode(selectedProfile.targetMode).includes('aliyun') : false,
    [selectedProfile]
  )

  const load = async (nextProfileId?: string) => {
    setLoading(true)
    try {
      const loadedSettings = await fetchSettings()
      setSettings(loadedSettings)
      const id = nextProfileId || profileId || loadedSettings.activeProfileId
      setProfileId(id)
      setStatus(await fetchProjectCapabilityStatus(id))
    } finally {
      setLoading(false)
    }
  }

  const updateExtension = async (
    extensionId: string,
    enabled: boolean,
    options?: { activateProfile?: boolean; silent?: boolean }
  ) => {
    const targetProfileId = profileId || settings?.activeProfileId
    if (!targetProfileId) return

    setSavingExtensionId(extensionId)
    try {
      const latest = await fetchSettings()
      const nextProfiles = latest.profiles.map((profile) => {
        if (profile.id !== targetProfileId) return profile
        const currentExtensions = profile.extensions || DEFAULT_PROFILE_EXTENSIONS
        const enabledIds = new Set(currentExtensions.enabledIds || [])
        if (enabled) enabledIds.add(extensionId)
        else enabledIds.delete(extensionId)
        const currentConfig = isRecord(currentExtensions.configs?.[extensionId])
          ? currentExtensions.configs[extensionId] as Record<string, unknown>
          : {}
        const nextProfile = {
          ...profile,
          extensions: {
            enabledIds: Array.from(enabledIds),
            configs: {
              ...DEFAULT_PROFILE_EXTENSIONS.configs,
              ...(currentExtensions.configs || {}),
              [extensionId]: {
                ...currentConfig,
                enabled
              }
            }
          },
          plugins: undefined
        }
        return nextProfile
      })

      await saveSettings({
        profiles: nextProfiles,
        activeProfileId: options?.activateProfile ? targetProfileId : latest.activeProfileId
      })
      await load(targetProfileId)
      if (!options?.silent) {
        showToast(enabled ? '扩展插件已启用' : '扩展插件已停用', 'success')
      }
    } catch (error) {
      showToast(`扩展插件更新失败: ${error}`, 'error')
      throw error
    } finally {
      setSavingExtensionId(null)
    }
  }

  const openOssBrowser = async () => {
    if (!selectedProfileHasAliyun) {
      showToast('OSS 浏览需要当前 Profile 包含阿里云目标', 'warning')
      return
    }
    if (!ossConfigComplete(settings)) {
      showToast('请先完善阿里云 OSS 连接配置', 'warning')
      navigate('/settings')
      return
    }

    const ossStatus = status?.extensions.find((item) => item.manifest.id === EXTENSION_IDS.OSS_BROWSER)
    if (!ossStatus?.enabled || settings?.activeProfileId !== profileId) {
      await updateExtension(EXTENSION_IDS.OSS_BROWSER, true, {
        activateProfile: true,
        silent: true
      })
    }
    navigate('/oss-browser')
  }

  useEffect(() => {
    load().catch(() => {})
  }, [])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Plug className="h-5 w-5" />
            项目能力
          </h1>
          <div className="text-sm text-muted-foreground">
            当前 Profile: {status?.profileName || '-'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={profileId}
            onChange={(event) => {
              const nextId = event.target.value
              setProfileId(nextId)
              load(nextId).catch(() => {})
            }}
          >
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Button size="sm" onClick={() => navigate('/settings')}>
            <Settings className="h-4 w-4 mr-1" />
            配置
          </Button>
        </div>
      </div>

      {status?.uploadPipeline && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <CardTitle className="text-base leading-6">
                {status.uploadPipeline.manifest.name}
              </CardTitle>
              <Badge variant="success">当前流程</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{categoryLabel(status.uploadPipeline.manifest.category)}</Badge>
              <span className="text-xs text-muted-foreground">v{status.uploadPipeline.manifest.version}</span>
            </div>
            <p className="text-muted-foreground">{status.uploadPipeline.manifest.description}</p>
            <div className="text-xs border rounded-md px-3 py-2 bg-muted/30">
              配置摘要: {status.uploadPipeline.configSummary || '-'}
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              <div>
                最近运行:{' '}
                {status.uploadPipeline.lastRun ? (
                  <Badge variant={statusVariant(status.uploadPipeline.lastRun.status)}>
                    {status.uploadPipeline.lastRun.status}
                  </Badge>
                ) : (
                  '-'
                )}
              </div>
              <div>开始时间: {formatTime(status.uploadPipeline.lastRun?.startedAt || null)}</div>
              <div>结束时间: {formatTime(status.uploadPipeline.lastRun?.completedAt || null)}</div>
              {status.uploadPipeline.lastRun?.errorMessage && (
                <div className="text-destructive break-all">
                  {status.uploadPipeline.lastRun.errorMessage}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {(status?.extensions || []).map((item) => (
          <Card key={item.manifest.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-base leading-6">{item.manifest.name}</CardTitle>
                <Badge variant={item.enabled ? 'success' : 'secondary'}>
                  {item.enabled ? '已启用' : '未启用'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{categoryLabel(item.manifest.category)}</Badge>
                <span className="text-xs text-muted-foreground">v{item.manifest.version}</span>
              </div>
              <p className="text-muted-foreground min-h-[44px]">{item.manifest.description}</p>
              <div className="text-xs border rounded-md px-3 py-2 bg-muted/30">
                配置摘要: {item.configSummary || '-'}
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>
                  最近运行:{' '}
                  {item.lastRun ? (
                    <Badge variant={statusVariant(item.lastRun.status)}>{item.lastRun.status}</Badge>
                  ) : (
                    '-'
                  )}
                </div>
                <div>开始时间: {formatTime(item.lastRun?.startedAt || null)}</div>
                <div>结束时间: {formatTime(item.lastRun?.completedAt || null)}</div>
                {item.lastRun?.errorMessage && (
                  <div className="text-destructive break-all">{item.lastRun.errorMessage}</div>
                )}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  size="sm"
                  variant={item.enabled ? 'outline' : 'default'}
                  disabled={savingExtensionId === item.manifest.id}
                  onClick={() => updateExtension(item.manifest.id, !item.enabled).catch(() => {})}
                >
                  {item.enabled ? (
                    <PowerOff className="h-4 w-4 mr-1" />
                  ) : (
                    <Power className="h-4 w-4 mr-1" />
                  )}
                  {item.enabled ? '停用' : '启用'}
                </Button>
                {item.manifest.id === EXTENSION_IDS.OSS_BROWSER && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={savingExtensionId === item.manifest.id || !selectedProfileHasAliyun}
                    onClick={() => openOssBrowser().catch(() => {})}
                  >
                    <ExternalLink className="h-4 w-4 mr-1" />
                    {item.enabled ? '打开 OSS 浏览' : '启用并打开'}
                  </Button>
                )}
                {item.manifest.id === EXTENSION_IDS.WEBHOOK_NOTIFIER && (
                  <Button size="sm" variant="outline" onClick={() => navigate('/settings')}>
                    <Settings className="h-4 w-4 mr-1" />
                    配置通知
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
