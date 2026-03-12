import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import log from 'electron-log'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('数据库未初始化')
  }
  return db
}

export function initDatabase(): void {
  const dbPath = join(app.getPath('userData'), 'uploader.db')
  log.info('数据库路径:', dbPath)

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  runMigrations(db)
  log.info('数据库初始化完成')
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      folder_path TEXT NOT NULL,
      folder_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      total_files INTEGER NOT NULL DEFAULT 0,
      uploaded_files INTEGER NOT NULL DEFAULT 0,
      total_bytes INTEGER NOT NULL DEFAULT 0,
      uploaded_bytes INTEGER NOT NULL DEFAULT 0,
      oss_prefix TEXT,
      error_message TEXT,
      source_type TEXT NOT NULL DEFAULT 'local',
      source_machine_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS task_files (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      oss_key TEXT,
      upload_id TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_task_files_task_id ON task_files(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_files_status ON task_files(status);

    CREATE TABLE IF NOT EXISTS ssh_machines (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 22,
      username TEXT NOT NULL,
      auth_type TEXT NOT NULL DEFAULT 'key',
      private_key_path TEXT,
      encrypted_password TEXT,
      remote_dir TEXT NOT NULL,
      local_dir TEXT NOT NULL,
      bw_limit INTEGER NOT NULL DEFAULT 5000,
      cpu_nice INTEGER NOT NULL DEFAULT 19,
      transfer_mode TEXT NOT NULL DEFAULT 'rsync',
      enabled INTEGER NOT NULL DEFAULT 1,
      last_sync_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)

  // 增量迁移：为已有的 ssh_machines 表补充 transfer_mode 列
  const columns = db.pragma('table_info(ssh_machines)') as Array<{ name: string }>
  const hasTransferMode = columns.some((c) => c.name === 'transfer_mode')
  if (!hasTransferMode) {
    db.exec(`ALTER TABLE ssh_machines ADD COLUMN transfer_mode TEXT NOT NULL DEFAULT 'rsync'`)
    log.info('迁移: ssh_machines 表添加 transfer_mode 列')
  }
}
