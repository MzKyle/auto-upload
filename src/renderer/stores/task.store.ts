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
    set((state) => ({
      progress: { ...state.progress, [progressKey(p.taskId, p.provider)]: p }
    }))
  },

  setProgressBatch: (items: TaskProgress[]) => {
    if (items.length === 0) return
    set((state) => {
      const progress = { ...state.progress }
      for (const item of items) {
        progress[progressKey(item.taskId, item.provider)] = item
      }
      return { progress }
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
