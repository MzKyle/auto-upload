import { create } from 'zustand'
import type { Task, TaskProgress } from '@shared/types'
import { fetchTasks } from '@/lib/ipc-client'

interface TaskStore {
  tasks: Task[]
  progress: Record<string, TaskProgress>
  loading: boolean
  loadTasks: () => Promise<void>
  setProgress: (p: TaskProgress) => void
  updateTaskStatus: (taskId: string, status: Task['status']) => void
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
      progress: { ...state.progress, [p.taskId]: p }
    }))
  },

  updateTaskStatus: (taskId: string, status: Task['status']) => {
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, status } : t))
    }))
  }
}))
