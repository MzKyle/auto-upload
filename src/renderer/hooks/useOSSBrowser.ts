import { useCallback, useEffect, useMemo, useState } from 'react'
import type { OSSListResult, OSSObjectItem, OSSPrefixItem } from '@shared/types'
import { listOSSObjects } from '@/lib/ipc-client'

export type OSSSortBy = 'name' | 'size' | 'lastModified'

export type OSSSelectedItem =
  | { kind: 'prefix'; item: OSSPrefixItem }
  | { kind: 'object'; item: OSSObjectItem }

export interface OSSBrowserState {
  loading: boolean
  loadingMore: boolean
  error: string | null
  searchText: string
  sortBy: OSSSortBy
  sortAsc: boolean
  currentPrefix: string
  prefixes: OSSPrefixItem[]
  objects: OSSObjectItem[]
  isTruncated: boolean
  selectedKey: string | null
}

function splitPrefix(prefix: string): string[] {
  return prefix.split('/').filter(Boolean)
}

function containsIgnoreCase(text: string, keyword: string): boolean {
  return text.toLowerCase().includes(keyword.toLowerCase())
}

export function useOSSBrowser(): {
  state: OSSBrowserState
  breadcrumbs: Array<{ label: string; prefix: string }>
  filteredObjects: OSSObjectItem[]
  selectedItem: OSSSelectedItem | null
  setSearchText: (value: string) => void
  setSortBy: (value: OSSSortBy) => void
  toggleSortDirection: () => void
  openPrefix: (prefix: string) => Promise<void>
  refresh: () => Promise<void>
  goParent: () => Promise<void>
  loadMore: () => Promise<void>
  selectObject: (obj: OSSObjectItem) => void
} {
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')
  const [sortBy, setSortBy] = useState<OSSSortBy>('name')
  const [sortAsc, setSortAsc] = useState(true)
  const [currentPrefix, setCurrentPrefix] = useState('')
  const [prefixes, setPrefixes] = useState<OSSPrefixItem[]>([])
  const [objects, setObjects] = useState<OSSObjectItem[]>([])
  const [nextToken, setNextToken] = useState<string | undefined>()
  const [isTruncated, setIsTruncated] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const applyList = useCallback((result: OSSListResult, append: boolean) => {
    setCurrentPrefix(result.effectivePrefix)
    setPrefixes(result.prefixes)
    setObjects((prev) => (append ? [...prev, ...result.objects] : result.objects))
    setNextToken(result.nextContinuationToken)
    setIsTruncated(result.isTruncated)
  }, [])

  const loadList = useCallback(
    async (prefix?: string, continuationToken?: string, append: boolean = false) => {
      try {
        if (append) setLoadingMore(true)
        else setLoading(true)
        setError(null)

        const result = await listOSSObjects({
          prefix,
          continuationToken,
          maxKeys: 200
        })
        setSelectedKey(null)
        applyList(result, append)
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [applyList]
  )

  const refresh = useCallback(async () => {
    await loadList(currentPrefix || undefined)
  }, [currentPrefix, loadList])

  const openPrefix = useCallback(
    async (prefix: string) => {
      await loadList(prefix, undefined, false)
    },
    [loadList]
  )

  const goParent = useCallback(async () => {
    const segments = splitPrefix(currentPrefix)
    if (segments.length === 0) {
      await openPrefix('')
      return
    }
    const parent = segments.slice(0, -1).join('/')
    await openPrefix(parent)
  }, [currentPrefix, openPrefix])

  const loadMore = useCallback(async () => {
    if (!isTruncated || !nextToken || loadingMore) return
    await loadList(currentPrefix, nextToken, true)
  }, [currentPrefix, isTruncated, loadingMore, loadList, nextToken])

  const selectObject = useCallback((obj: OSSObjectItem) => {
    setSelectedKey(obj.key)
  }, [])

  useEffect(() => {
    loadList(undefined, undefined, false).catch(() => {})
  }, [loadList])

  const breadcrumbs = useMemo(() => {
    const segments = splitPrefix(currentPrefix)
    const items: Array<{ label: string; prefix: string }> = [{ label: '根目录', prefix: '' }]
    let cursor = ''
    for (const seg of segments) {
      cursor = `${cursor}${seg}/`
      items.push({ label: seg, prefix: cursor })
    }
    return items
  }, [currentPrefix])

  const filteredObjects = useMemo(() => {
    const keyword = searchText.trim()
    const filtered = keyword ? objects.filter((item) => containsIgnoreCase(item.name, keyword)) : objects

    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'size') return a.size - b.size
      if (sortBy === 'lastModified') return a.lastModified.localeCompare(b.lastModified)
      return a.name.localeCompare(b.name, 'zh-CN')
    })

    return sortAsc ? sorted : sorted.reverse()
  }, [objects, searchText, sortAsc, sortBy])

  const selectedItem = useMemo<OSSSelectedItem | null>(() => {
    if (!selectedKey) return null
    if (selectedKey.startsWith('dir:')) {
      const prefixValue = selectedKey.slice(4)
      const prefix = prefixes.find((item) => item.prefix === prefixValue)
      return prefix ? { kind: 'prefix', item: prefix } : null
    }
    const object = objects.find((item) => item.key === selectedKey)
    return object ? { kind: 'object', item: object } : null
  }, [objects, prefixes, selectedKey])

  return {
    state: {
      loading,
      loadingMore,
      error,
      searchText,
      sortBy,
      sortAsc,
      currentPrefix,
      prefixes,
      objects,
      isTruncated,
      selectedKey
    },
    breadcrumbs,
    filteredObjects,
    selectedItem,
    setSearchText,
    setSortBy,
    toggleSortDirection: () => setSortAsc((v) => !v),
    openPrefix,
    refresh,
    goParent,
    loadMore,
    selectObject
  }
}
