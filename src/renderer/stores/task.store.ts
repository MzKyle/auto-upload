import { create } from 'zustand'
import type {
  Task,
  TaskDestinationStatusEvent,
  TaskProgress
} from '@shared/types'
import { fetchTasks } from '@/lib/ipc-client'
import { progressKey } from '@shared/cloud-upload'

interface TaskStore {
  tasks: Task[]
  progress: Record<string, TaskProgress>
  loading: boolean
  loadTasks: () => Promise<void>
  setProgress: (p: TaskProgress) => void
  setProgressBatch: (items: TaskProgress[]) => void
  updateTaskStatus: (taskId: string, status: Task['status']) => void
  updateDestinationStatus: (event: TaskDestinationStatusEvent) => void
}

export const useTaskStore = create<TaskStore>((set) => ({
  tasks: [],
  progress: {},
  loading: false,

  loadTasks: async () => {
    set({ loading: true })
    try {
      const tasks = await fetchTasks()
      set({ tasks })
    } finally {
      set({ loading: false })
    }
  },

  setProgress: (p: TaskProgress) => {
    set((state) => {
      const key = progressKey(p.taskId, p.provider)
      const current = state.progress[key]
      if (current && isSameProgress(current, p)) return state
      return { progress: { ...state.progress, [key]: p } }
    })
  },

  setProgressBatch: (items: TaskProgress[]) => {
    if (items.length === 0) return
    set((state) => {
      let progress = state.progress
      let changed = false
      for (const item of items) {
        const key = progressKey(item.taskId, item.provider)
        const current = progress[key]
        if (current && isSameProgress(current, item)) continue
        if (!changed) {
          progress = { ...state.progress }
          changed = true
        }
        progress[key] = item
      }
      return changed ? { progress } : state
    })
  },

  updateTaskStatus: (taskId: string, status: Task['status']) => {
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, status } : t))
    }))
  },

  updateDestinationStatus: (event: TaskDestinationStatusEvent) => {
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === event.taskId
          ? {
              ...task,
              destinations: task.destinations.map((destination) =>
                destination.provider === event.provider
                  ? {
                      ...destination,
                      status: event.status,
                      errorMessage: event.errorMessage || null
                    }
                  : destination
              )
            }
          : task
      )
    }))
  }
}))

function isSameProgress(a: TaskProgress, b: TaskProgress): boolean {
  return (
    a.taskId === b.taskId &&
    a.provider === b.provider &&
    a.uploadedFiles === b.uploadedFiles &&
    a.totalFiles === b.totalFiles &&
    a.uploadedBytes === b.uploadedBytes &&
    a.totalBytes === b.totalBytes &&
    a.speed === b.speed &&
    a.currentFile === b.currentFile &&
    a.queuedFiles === b.queuedFiles &&
    a.activeUploads === b.activeUploads &&
    a.failedFiles === b.failedFiles &&
    a.skippedFiles === b.skippedFiles &&
    a.transferredBytes === b.transferredBytes
  )
}
