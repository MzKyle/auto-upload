import { v4 as uuid } from 'uuid'
import { getDb } from './database'
import type { PluginCategory, PluginRunStatus, TaskPluginRun } from '@shared/types'

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string' || !value) return null
  try {
    const parsed = JSON.parse(value) as unknown
    return typeof parsed === 'object' && parsed !== null
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function rowToTaskPluginRun(row: Record<string, unknown>): TaskPluginRun {
  return {
    id: row.id as string,
    taskId: row.task_id as string,
    pluginId: row.plugin_id as string,
    category: row.category as PluginCategory,
    status: row.status as PluginRunStatus,
    startedAt: row.started_at as string,
    completedAt: (row.completed_at as string) || null,
    errorMessage: (row.error_message as string) || null,
    summary: parseJsonRecord(row.summary_json),
    stagingPath: (row.staging_path as string) || null,
    artifacts: parseJsonRecord(row.artifacts_json)
  }
}

function stringifyRecord(value?: Record<string, unknown> | null): string | null {
  return value ? JSON.stringify(value) : null
}

export class PluginRunRepo {
  start(taskId: string, pluginId: string, category: PluginCategory): TaskPluginRun {
    const id = uuid()
    const now = new Date().toISOString()
    getDb().prepare(
      `INSERT INTO task_plugin_runs (
        id, task_id, plugin_id, category, status, started_at
      ) VALUES (?, ?, ?, ?, 'running', ?)`
    ).run(id, taskId, pluginId, category, now)
    return this.getById(id)!
  }

  complete(
    id: string,
    input: {
      status?: PluginRunStatus
      summary?: Record<string, unknown> | null
      stagingPath?: string | null
      artifacts?: Record<string, unknown> | null
      errorMessage?: string | null
    } = {}
  ): void {
    getDb().prepare(
      `UPDATE task_plugin_runs
       SET status = ?, completed_at = ?, error_message = ?,
         summary_json = ?, staging_path = ?, artifacts_json = ?
       WHERE id = ?`
    ).run(
      input.status || 'completed',
      new Date().toISOString(),
      input.errorMessage || null,
      stringifyRecord(input.summary),
      input.stagingPath || null,
      stringifyRecord(input.artifacts),
      id
    )
  }

  fail(id: string, errorMessage: string): void {
    this.complete(id, {
      status: 'failed',
      errorMessage
    })
  }

  getById(id: string): TaskPluginRun | null {
    const row = getDb()
      .prepare('SELECT * FROM task_plugin_runs WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined
    return row ? rowToTaskPluginRun(row) : null
  }

  listByTask(taskId: string): TaskPluginRun[] {
    return (
      getDb()
        .prepare(
          `SELECT * FROM task_plugin_runs
           WHERE task_id = ?
           ORDER BY started_at DESC`
        )
        .all(taskId) as Record<string, unknown>[]
    ).map(rowToTaskPluginRun)
  }

  listRecent(limit = 50): TaskPluginRun[] {
    return (
      getDb()
        .prepare(
          `SELECT * FROM task_plugin_runs
           ORDER BY started_at DESC
           LIMIT ?`
        )
        .all(Math.max(1, limit)) as Record<string, unknown>[]
    ).map(rowToTaskPluginRun)
  }

  listStagingPathsForCompletedTasks(retentionDays: number): Array<{ taskId: string; stagingPath: string }> {
    const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString()
    return (
      getDb()
        .prepare(
          `SELECT DISTINCT tpr.task_id, tpr.staging_path
           FROM task_plugin_runs tpr
           INNER JOIN tasks t ON t.id = tpr.task_id
           WHERE tpr.staging_path IS NOT NULL
             AND t.status IN ('completed', 'synced')
             AND t.completed_at IS NOT NULL
             AND t.completed_at < ?`
        )
        .all(cutoff) as Array<{ task_id: string; staging_path: string }>
    ).map((row) => ({
      taskId: row.task_id,
      stagingPath: row.staging_path
    }))
  }
}

let instance: PluginRunRepo | null = null
export function getPluginRunRepo(): PluginRunRepo {
  if (!instance) instance = new PluginRunRepo()
  return instance
}
