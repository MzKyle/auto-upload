import { getDb } from './database'
import { v4 as uuid } from 'uuid'
import { normalize } from 'path'
import type { Task, TaskFile, TaskStatus, SourceType } from '@shared/types'

function normalizeFolderPath(p: string): string {
  return normalize(p).replace(/[\\/]+$/, '')
}

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    folderPath: row.folder_path as string,
    folderName: row.folder_name as string,
    status: row.status as TaskStatus,
    totalFiles: row.total_files as number,
    uploadedFiles: row.uploaded_files as number,
    totalBytes: row.total_bytes as number,
    uploadedBytes: row.uploaded_bytes as number,
    ossPrefix: (row.oss_prefix as string) || '',
    errorMessage: (row.error_message as string) || null,
    sourceType: row.source_type as SourceType,
    sourceMachineId: (row.source_machine_id as string) || null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    completedAt: (row.completed_at as string) || null
  }
}

function rowToTaskFile(row: Record<string, unknown>): TaskFile {
  return {
    id: row.id as string,
    taskId: row.task_id as string,
    relativePath: row.relative_path as string,
    fileSize: row.file_size as number,
    status: row.status as TaskFile['status'],
    ossKey: (row.oss_key as string) || null,
    uploadId: (row.upload_id as string) || null,
    errorMessage: (row.error_message as string) || null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  }
}

export class TaskRepo {
  listByStatus(status?: TaskStatus): Task[] {
    const db = getDb()
    if (status) {
      return (db.prepare('SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC').all(status) as Record<string, unknown>[]).map(rowToTask)
    }
    return (db.prepare('SELECT * FROM tasks ORDER BY created_at DESC').all() as Record<string, unknown>[]).map(rowToTask)
  }

  getById(id: string): Task | null {
    const db = getDb()
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? rowToTask(row) : null
  }

  getByFolderPath(folderPath: string): Task | null {
    const db = getDb()
    const normalized = normalizeFolderPath(folderPath)
    const row = db.prepare('SELECT * FROM tasks WHERE folder_path = ? ORDER BY created_at DESC LIMIT 1').get(normalized) as Record<string, unknown> | undefined
    return row ? rowToTask(row) : null
  }

  /**
   * Find the task whose folderPath is a parent directory of the given file path.
   * Returns the most specific match (longest folderPath).
   */
  findTaskContainingFile(filePath: string): Task | null {
    const db = getDb()
    const normalized = normalize(filePath)
    const tasks = (db.prepare('SELECT * FROM tasks ORDER BY length(folder_path) DESC').all() as Record<string, unknown>[]).map(rowToTask)
    return tasks.find((t) => {
      const fp = t.folderPath
      return normalized.startsWith(fp + '/') || normalized.startsWith(fp + '\\')
    }) || null
  }

  create(params: {
    folderPath: string
    folderName: string
    ossPrefix?: string
    sourceType?: SourceType
    sourceMachineId?: string
  }): Task {
    const db = getDb()
    const id = uuid()
    const now = new Date().toISOString()
    const normalizedPath = normalizeFolderPath(params.folderPath)
    db.prepare(
      `INSERT INTO tasks (id, folder_path, folder_name, status, oss_prefix, source_type, source_machine_id, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)`
    ).run(id, normalizedPath, params.folderName, params.ossPrefix || '', params.sourceType || 'local', params.sourceMachineId || null, now, now)
    return this.getById(id)!
  }

  updateStatus(id: string, status: TaskStatus, errorMessage?: string): void {
    const db = getDb()
    const now = new Date().toISOString()
    const completedAt = (status === 'completed' || status === 'failed') ? now : null
    db.prepare(
      'UPDATE tasks SET status = ?, error_message = ?, updated_at = ?, completed_at = COALESCE(?, completed_at) WHERE id = ?'
    ).run(status, errorMessage || null, now, completedAt, id)
  }

  updateProgress(id: string, uploadedFiles: number, uploadedBytes: number): void {
    const db = getDb()
    const now = new Date().toISOString()
    db.prepare(
      'UPDATE tasks SET uploaded_files = ?, uploaded_bytes = ?, updated_at = ? WHERE id = ?'
    ).run(uploadedFiles, uploadedBytes, now, id)
  }

  setTotals(id: string, totalFiles: number, totalBytes: number): void {
    const db = getDb()
    const now = new Date().toISOString()
    db.prepare(
      'UPDATE tasks SET total_files = ?, total_bytes = ?, updated_at = ? WHERE id = ?'
    ).run(totalFiles, totalBytes, now, id)
  }

  // ---- task_files ----
  createFile(taskId: string, relativePath: string, fileSize: number): TaskFile {
    const db = getDb()
    const id = uuid()
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO task_files (id, task_id, relative_path, file_size, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`
    ).run(id, taskId, relativePath, fileSize, now, now)
    return rowToTaskFile(db.prepare('SELECT * FROM task_files WHERE id = ?').get(id) as Record<string, unknown>)
  }

  bulkCreateFiles(taskId: string, files: Array<{ relativePath: string; fileSize: number }>): void {
    const db = getDb()
    const now = new Date().toISOString()
    const stmt = db.prepare(
      `INSERT INTO task_files (id, task_id, relative_path, file_size, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`
    )
    const transaction = db.transaction(() => {
      for (const f of files) {
        stmt.run(uuid(), taskId, f.relativePath, f.fileSize, now, now)
      }
    })
    transaction()
  }

  listFiles(taskId: string, status?: string): TaskFile[] {
    const db = getDb()
    if (status) {
      return (db.prepare('SELECT * FROM task_files WHERE task_id = ? AND status = ?').all(taskId, status) as Record<string, unknown>[]).map(rowToTaskFile)
    }
    return (db.prepare('SELECT * FROM task_files WHERE task_id = ?').all(taskId) as Record<string, unknown>[]).map(rowToTaskFile)
  }

  updateFileStatus(fileId: string, status: string, ossKey?: string, uploadId?: string, errorMessage?: string): void {
    const db = getDb()
    const now = new Date().toISOString()
    db.prepare(
      'UPDATE task_files SET status = ?, oss_key = COALESCE(?, oss_key), upload_id = COALESCE(?, upload_id), error_message = ?, updated_at = ? WHERE id = ?'
    ).run(status, ossKey || null, uploadId || null, errorMessage || null, now, fileId)
  }

  getUnfinishedTasks(): Task[] {
    const db = getDb()
    return (db.prepare("SELECT * FROM tasks WHERE status IN ('pending', 'uploading', 'scanning') ORDER BY created_at ASC").all() as Record<string, unknown>[]).map(rowToTask)
  }

  getCompletedForCleanup(retentionDays: number): Task[] {
    const db = getDb()
    const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString()
    return (db.prepare(
      `SELECT * FROM tasks WHERE status = 'completed' AND source_type IN ('local', 'rsync') AND completed_at IS NOT NULL AND completed_at < ? ORDER BY completed_at ASC`
    ).all(cutoff) as Record<string, unknown>[]).map(rowToTask)
  }
}

let instance: TaskRepo | null = null
export function getTaskRepo(): TaskRepo {
  if (!instance) instance = new TaskRepo()
  return instance
}
