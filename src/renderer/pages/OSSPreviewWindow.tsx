import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Image as ImageIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getOSSImagePreview, headOSSObject } from '@/lib/ipc-client'
import { formatBytes } from '@/lib/utils'
import type { OSSObjectHead } from '@shared/types'

function formatTime(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('zh-CN', { hour12: false })
}

export default function OSSPreviewWindow() {
  const location = useLocation()
  const key = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return params.get('key') || ''
  }, [location.search])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [head, setHead] = useState<OSSObjectHead | null>(null)
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      if (!key) {
        setError('缺少预览 key 参数')
        return
      }

      try {
        setLoading(true)
        setError(null)
        setImageDataUrl(null)

        const meta = await headOSSObject(key)
        setHead(meta)

        const image = await getOSSImagePreview(key)
        setImageDataUrl(image.dataUrl)
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    }

    run().catch(() => {})
  }, [key])

  return (
    <div className="p-4 h-screen flex flex-col gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">文件信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="break-all">{key || '-'}</div>
          {head && (
            <div className="text-xs text-muted-foreground grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>大小: {formatBytes(head.size)}</div>
              <div>修改时间: {formatTime(head.lastModified)}</div>
              <div>类型: {head.contentType || '-'}</div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="flex-1 min-h-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            图片预览
          </CardTitle>
        </CardHeader>
        <CardContent className="h-[calc(100%-56px)]">
          {loading && (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              预览加载中...
            </div>
          )}

          {!loading && error && (
            <div className="h-full flex items-center justify-center text-sm text-destructive border border-destructive/40 rounded-md bg-destructive/10 px-3">
              {error}
            </div>
          )}

          {!loading && !error && imageDataUrl && (
            <div className="h-full border rounded-md bg-muted/20 p-2">
              <img src={imageDataUrl} alt={key} className="w-full h-full object-contain rounded" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
