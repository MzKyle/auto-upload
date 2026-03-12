import { getDb } from './database'
import type { HistoryQuery, HistoryResult, HistoryItem } from '@shared/types'

function rowToHistory(row: Record<string, unknown>): HistoryItem {
  return {
    id: row.id as string,
    folderName: row.folder_name as string,
    fileCount: row.total_files as number,
    totalBytes: row.total_bytes as number,
    durationSeconds: row.duration_seconds as number,
    status: row.status as 'completed' | 'failed',
    completedAt: row.completed_at as string
  }
}

export class HistoryRepo {
  list(query: HistoryQuery): HistoryResult {
    const db = getDb()
    const { page, pageSize, status } = query
    const offset = (page - 1) * pageSize

    let where = "WHERE status IN ('completed', 'failed') AND completed_at IS NOT NULL"
    const params: unknown[] = []
    if (status) {
      where += ' AND status = ?'
      params.push(status)
    }

    const countRow = db
      .prepare(`SELECT COUNT(*) as cnt FROM tasks ${where}`)
      .get(...params) as { cnt: number }
    const total = countRow.cnt

    const rows = db
      .prepare(
        `SELECT id, folder_name, total_files, total_bytes, status, completed_at,
         CAST((julianday(completed_at) - julianday(created_at)) * 86400 AS INTEGER) as duration_seconds
         FROM tasks ${where} ORDER BY completed_at DESC LIMIT ? OFFSET ?`
      )
      .all(...params, pageSize, offset) as Record<string, unknown>[]

    return { items: rows.map(rowToHistory), total }
  }

  clear(before?: string): void {
    const db = getDb()
    if (before) {
      db.prepare("DELETE FROM tasks WHERE status IN ('completed', 'failed') AND completed_at < ?").run(before)
    } else {
      db.prepare("DELETE FROM tasks WHERE status IN ('completed', 'failed')").run()
    }
  }
}

let instance: HistoryRepo | null = null
export function getHistoryRepo(): HistoryRepo {
  if (!instance) instance = new HistoryRepo()
  return instance
}
