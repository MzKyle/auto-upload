import { getDb } from './database'
import { DEFAULT_SETTINGS } from '@shared/constants'
import type { AppSettings } from '@shared/types'

export class SettingsRepo {
  get<T>(key: string): T | null {
    const db = getDb()
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    if (!row) return null
    try {
      return JSON.parse(row.value) as T
    } catch {
      return row.value as unknown as T
    }
  }

  set(key: string, value: unknown): void {
    const db = getDb()
    const now = new Date().toISOString()
    const serialized = typeof value === 'string' ? value : JSON.stringify(value)
    db.prepare(
      'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?'
    ).run(key, serialized, now, serialized, now)
  }

  getAll(): AppSettings {
    const settings = { ...DEFAULT_SETTINGS }

    const keys: Array<{ section: keyof AppSettings; key: string }> = [
      { section: 'scan', key: 'scan' },
      { section: 'upload', key: 'upload' },
      { section: 'oss', key: 'oss' },
      { section: 'filter', key: 'filter' },
      { section: 'webhook', key: 'webhook' },
      { section: 'stability', key: 'stability' },
      { section: 'log', key: 'log' },
      { section: 'dataCollect', key: 'dataCollect' }
    ]

    for (const { section, key } of keys) {
      const val = this.get(key)
      if (val !== null) {
        ; (settings as Record<string, unknown>)[section] = val
      }
    }

    const hotkey = this.get<string>('hotkey')
    if (hotkey) settings.hotkey = hotkey

    return settings
  }

  saveAll(partial: Partial<AppSettings>): void {
    const db = getDb()
    const transaction = db.transaction(() => {
      for (const [key, value] of Object.entries(partial)) {
        if (value !== undefined) {
          this.set(key, value)
        }
      }
    })
    transaction()
  }
}

let instance: SettingsRepo | null = null
export function getSettingsRepo(): SettingsRepo {
  if (!instance) instance = new SettingsRepo()
  return instance
}
