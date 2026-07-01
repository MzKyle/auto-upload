import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import {
  runMigrations,
  setDbForTests
} from '../src/main/db/database'
import { TaskDestinationRepo } from '../src/main/db/task-destination.repo'
import { TaskRepo } from '../src/main/db/task.repo'
import { TaskRunnerService } from '../src/main/services/task-runner.service'

test('logical progress persistence is throttled and force flushes latest values', () => {
  const originalUpdateProgress = TaskRepo.prototype.updateProgress
  const originalNow = Date.now
  const calls: Array<{
    taskId: string
    uploadedFiles: number
    uploadedBytes: number
  }> = []
  let now = 1_000_000

  TaskRepo.prototype.updateProgress = function (
    taskId: string,
    uploadedFiles: number,
    uploadedBytes: number
  ): void {
    calls.push({ taskId, uploadedFiles, uploadedBytes })
  }
  Date.now = () => now

  try {
    const service = new TaskRunnerService() as unknown as {
      persistLogicalProgress: (
        taskId: string,
        logicalProgress: {
          completedThisRun: Set<string>
          uploadedFiles: number
          uploadedBytes: number
          lastPersistAt: number
        },
        force?: boolean
      ) => void
    }
    const progress = {
      completedThisRun: new Set<string>(),
      uploadedFiles: 1,
      uploadedBytes: 10,
      lastPersistAt: 0
    }

    service.persistLogicalProgress('task-1', progress)
    progress.uploadedFiles = 2
    progress.uploadedBytes = 20
    now += 250
    service.persistLogicalProgress('task-1', progress)

    assert.deepEqual(calls, [
      { taskId: 'task-1', uploadedFiles: 1, uploadedBytes: 10 }
    ])

    progress.uploadedFiles = 3
    progress.uploadedBytes = 30
    service.persistLogicalProgress('task-1', progress, true)

    assert.deepEqual(calls, [
      { taskId: 'task-1', uploadedFiles: 1, uploadedBytes: 10 },
      { taskId: 'task-1', uploadedFiles: 3, uploadedBytes: 30 }
    ])
  } finally {
    TaskRepo.prototype.updateProgress = originalUpdateProgress
    Date.now = originalNow
  }
})

test('unfinished task id listing avoids destination hydration', () => {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  setDbForTests(db)

  const originalListByTaskIds = TaskDestinationRepo.prototype.listByTaskIds
  let destinationBatchLoads = 0
  const createdAt = {
    pending: '2026-06-30T00:00:00.000Z',
    completed: '2026-06-30T00:00:01.000Z',
    paused: '2026-06-30T00:00:02.000Z'
  }
  const insertTask = db.prepare(`
    INSERT INTO tasks (
      id, folder_path, folder_name, status, oss_prefix, upload_target_mode,
      upload_relative_path, source_type, created_at, updated_at
    ) VALUES (?, ?, ?, ?, '', 'aliyun', ?, 'local', ?, ?)
  `)

  try {
    insertTask.run(
      'pending-task',
      '/tmp/pending-task',
      'pending-task',
      'pending',
      'pending-task',
      createdAt.pending,
      createdAt.pending
    )
    insertTask.run(
      'completed-task',
      '/tmp/completed-task',
      'completed-task',
      'completed',
      'completed-task',
      createdAt.completed,
      createdAt.completed
    )
    insertTask.run(
      'paused-task',
      '/tmp/paused-task',
      'paused-task',
      'paused',
      'paused-task',
      createdAt.paused,
      createdAt.paused
    )

    TaskDestinationRepo.prototype.listByTaskIds = function (taskIds: string[]) {
      destinationBatchLoads++
      return originalListByTaskIds.call(this, taskIds)
    }

    const repo = new TaskRepo()
    assert.deepEqual(repo.listUnfinishedTaskIds(), [
      'pending-task',
      'paused-task'
    ])
    assert.equal(destinationBatchLoads, 0)
  } finally {
    TaskDestinationRepo.prototype.listByTaskIds = originalListByTaskIds
    setDbForTests(null)
    db.close()
  }
})
