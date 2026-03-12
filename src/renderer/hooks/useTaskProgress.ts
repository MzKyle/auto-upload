import { useEffect, useCallback } from 'react'
import { IPC } from '@shared/ipc-channels'
import type { TaskProgress, TaskStatusEvent } from '@shared/types'
import { useTaskStore } from '@/stores/task.store'

export function useTaskProgress(): void {
  const setProgress = useTaskStore((s) => s.setProgress)
  const updateTaskStatus = useTaskStore((s) => s.updateTaskStatus)
  const loadTasks = useTaskStore((s) => s.loadTasks)

  const handleProgress = useCallback(
    (_event: unknown, data: unknown) => {
      setProgress(data as TaskProgress)
    },
    [setProgress]
  )

  const handleStatusChange = useCallback(
    (_event: unknown, data: unknown) => {
      const ev = data as TaskStatusEvent
      updateTaskStatus(ev.taskId, ev.newStatus)
      // 状态变更时重新加载完整列表
      loadTasks()
    },
    [updateTaskStatus, loadTasks]
  )

  useEffect(() => {
    const offProgress = window.api.on(IPC.TASK_PROGRESS, handleProgress as never)
    const offStatus = window.api.on(IPC.TASK_STATUS_CHANGE, handleStatusChange as never)
    return () => {
      offProgress()
      offStatus()
    }
  }, [handleProgress, handleStatusChange])
}
