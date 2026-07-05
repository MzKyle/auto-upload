import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plug, RefreshCw, Settings } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchProjectCapabilityStatus, fetchSettings } from '@/lib/ipc-client'
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

export default function Plugins() {
  const navigate = useNavigate()
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [profileId, setProfileId] = useState('')
  const [status, setStatus] = useState<ProjectCapabilityStatus | null>(null)
  const [loading, setLoading] = useState(false)

  const profiles = useMemo(() => settings?.profiles || [], [settings])

  const load = async (nextProfileId?: string) => {
    setLoading(true)
    try {
      const loadedSettings = settings || await fetchSettings()
      setSettings(loadedSettings)
      const id = nextProfileId || profileId || loadedSettings.activeProfileId
      setProfileId(id)
      setStatus(await fetchProjectCapabilityStatus(id))
    } finally {
      setLoading(false)
    }
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
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
