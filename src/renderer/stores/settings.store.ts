import { create } from 'zustand'
import type { AppSettings } from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/constants'
import { fetchSettings, saveSettings as saveSettingsApi } from '@/lib/ipc-client'

interface SettingsStore {
  settings: AppSettings
  loading: boolean
  loadSettings: () => Promise<void>
  saveSettings: (partial: Partial<AppSettings>) => Promise<void>
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loading: false,

  loadSettings: async () => {
    set({ loading: true })
    try {
      const settings = await fetchSettings()
      set({ settings })
    } finally {
      set({ loading: false })
    }
  },

  saveSettings: async (partial: Partial<AppSettings>) => {
    await saveSettingsApi(partial)
    const merged = { ...get().settings, ...partial }
    set({ settings: merged })
  }
}))
