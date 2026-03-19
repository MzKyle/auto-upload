"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const electron = require("electron");
const path = require("path");
const Database = require("better-sqlite3");
const log = require("electron-log");
const uuid = require("uuid");
const fs = require("fs");
const events = require("events");
const child_process = require("child_process");
const ssh2 = require("ssh2");
const promises = require("fs/promises");
const is = {
  dev: !electron.app.isPackaged
};
const platform = {
  isWindows: process.platform === "win32",
  isMacOS: process.platform === "darwin",
  isLinux: process.platform === "linux"
};
const electronApp = {
  setAppUserModelId(id) {
    if (platform.isWindows)
      electron.app.setAppUserModelId(is.dev ? process.execPath : id);
  },
  setAutoLaunch(auto) {
    if (platform.isLinux)
      return false;
    const isOpenAtLogin = () => {
      return electron.app.getLoginItemSettings().openAtLogin;
    };
    if (isOpenAtLogin() !== auto) {
      electron.app.setLoginItemSettings({
        openAtLogin: auto,
        path: process.execPath
      });
      return isOpenAtLogin() === auto;
    } else {
      return true;
    }
  },
  skipProxy() {
    return electron.session.defaultSession.setProxy({ mode: "direct" });
  }
};
const optimizer = {
  watchWindowShortcuts(window, shortcutOptions) {
    if (!window)
      return;
    const { webContents } = window;
    const { escToCloseWindow = false, zoom = false } = shortcutOptions || {};
    webContents.on("before-input-event", (event, input) => {
      if (input.type === "keyDown") {
        if (!is.dev) {
          if (input.code === "KeyR" && (input.control || input.meta))
            event.preventDefault();
        } else {
          if (input.code === "F12") {
            if (webContents.isDevToolsOpened()) {
              webContents.closeDevTools();
            } else {
              webContents.openDevTools({ mode: "undocked" });
              console.log("Open dev tool...");
            }
          }
        }
        if (escToCloseWindow) {
          if (input.code === "Escape" && input.key !== "Process") {
            window.close();
            event.preventDefault();
          }
        }
        if (!zoom) {
          if (input.code === "Minus" && (input.control || input.meta))
            event.preventDefault();
          if (input.code === "Equal" && input.shift && (input.control || input.meta))
            event.preventDefault();
        }
      }
    });
  },
  registerFramelessWindowIpc() {
    electron.ipcMain.on("win:invoke", (event, action) => {
      const win = electron.BrowserWindow.fromWebContents(event.sender);
      if (win) {
        if (action === "show") {
          win.show();
        } else if (action === "showInactive") {
          win.showInactive();
        } else if (action === "min") {
          win.minimize();
        } else if (action === "max") {
          const isMaximized = win.isMaximized();
          if (isMaximized) {
            win.unmaximize();
          } else {
            win.maximize();
          }
        } else if (action === "close") {
          win.close();
        }
      }
    });
  }
};
const IPC = {
  // 任务管理
  TASK_LIST: "task:list",
  TASK_GET: "task:get",
  TASK_ADD_FOLDER: "task:add-folder",
  TASK_PAUSE: "task:pause",
  TASK_RESUME: "task:resume",
  TASK_CANCEL: "task:cancel",
  TASK_RETRY: "task:retry",
  TASK_PROGRESS: "task:progress",
  // push from main
  TASK_STATUS_CHANGE: "task:status-change",
  // push from main
  // 扫描器
  SCANNER_STATUS: "scanner:status",
  SCANNER_TRIGGER: "scanner:trigger",
  SCANNER_START: "scanner:start",
  SCANNER_STOP: "scanner:stop",
  SCANNER_EVENT: "scanner:event",
  // push from main
  // 数采模式
  DATA_COLLECT_LIST: "data-collect:list",
  DATA_COLLECT_RUN: "data-collect:run",
  DATA_COLLECT_RESULT: "data-collect:result",
  // push from main
  // 设置
  SETTINGS_GET_ALL: "settings:get-all",
  SETTINGS_SAVE: "settings:save",
  SETTINGS_TEST_OSS: "settings:test-oss",
  // SSH / rsync
  SSH_LIST_MACHINES: "ssh:list-machines",
  SSH_ADD_MACHINE: "ssh:add-machine",
  SSH_UPDATE_MACHINE: "ssh:update-machine",
  SSH_DELETE_MACHINE: "ssh:delete-machine",
  SSH_TEST_CONNECTION: "ssh:test-connection",
  RSYNC_START: "rsync:start",
  RSYNC_STOP: "rsync:stop",
  RSYNC_PROGRESS: "rsync:progress",
  // push from main
  SFTP_START: "sftp:start",
  SFTP_STOP: "sftp:stop",
  SFTP_PROGRESS: "sftp:progress",
  // push from main
  // 历史
  HISTORY_LIST: "history:list",
  HISTORY_CLEAR: "history:clear",
  HISTORY_DELETE: "history:delete",
  // 磁盘用量
  DISK_USAGE: "disk:usage",
  // 窗口
  WINDOW_TOGGLE: "window:toggle",
  WINDOW_MINI_MONITOR: "window:mini-monitor",
  // 对话框
  DIALOG_SELECT_FOLDER: "dialog:select-folder",
  DIALOG_SELECT_DIRECTORY: "dialog:select-directory",
  // 标注
  ANNOTATION_OPEN_WINDOW: "annotation:open-window",
  ANNOTATION_SELECT_IMAGE: "annotation:select-image",
  ANNOTATION_READ_IMAGE: "annotation:read-image",
  ANNOTATION_SAVE_EXPORT: "annotation:save-export",
  ANNOTATION_UPLOAD_OSS: "annotation:upload-oss"
};
let db = null;
function getDb() {
  if (!db) {
    throw new Error("数据库未初始化");
  }
  return db;
}
function initDatabase() {
  const dbPath = path.join(electron.app.getPath("userData"), "uploader.db");
  log.info("数据库路径:", dbPath);
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  log.info("数据库初始化完成");
}
function runMigrations(db2) {
  db2.exec(`
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
  `);
  const columns = db2.pragma("table_info(ssh_machines)");
  const hasTransferMode = columns.some((c) => c.name === "transfer_mode");
  if (!hasTransferMode) {
    db2.exec(`ALTER TABLE ssh_machines ADD COLUMN transfer_mode TEXT NOT NULL DEFAULT 'rsync'`);
    log.info("迁移: ssh_machines 表添加 transfer_mode 列");
  }
}
function normalizeFolderPath(p) {
  return path.normalize(p).replace(/[\\/]+$/, "");
}
function rowToTask(row) {
  return {
    id: row.id,
    folderPath: row.folder_path,
    folderName: row.folder_name,
    status: row.status,
    totalFiles: row.total_files,
    uploadedFiles: row.uploaded_files,
    totalBytes: row.total_bytes,
    uploadedBytes: row.uploaded_bytes,
    ossPrefix: row.oss_prefix || "",
    errorMessage: row.error_message || null,
    sourceType: row.source_type,
    sourceMachineId: row.source_machine_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at || null
  };
}
function rowToTaskFile(row) {
  return {
    id: row.id,
    taskId: row.task_id,
    relativePath: row.relative_path,
    fileSize: row.file_size,
    status: row.status,
    ossKey: row.oss_key || null,
    uploadId: row.upload_id || null,
    errorMessage: row.error_message || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
class TaskRepo {
  listByStatus(status) {
    const db2 = getDb();
    if (status) {
      return db2.prepare("SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC").all(status).map(rowToTask);
    }
    return db2.prepare("SELECT * FROM tasks ORDER BY created_at DESC").all().map(rowToTask);
  }
  getById(id) {
    const db2 = getDb();
    const row = db2.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
    return row ? rowToTask(row) : null;
  }
  getByFolderPath(folderPath) {
    const db2 = getDb();
    const normalized = normalizeFolderPath(folderPath);
    const row = db2.prepare("SELECT * FROM tasks WHERE folder_path = ? ORDER BY created_at DESC LIMIT 1").get(normalized);
    return row ? rowToTask(row) : null;
  }
  /**
   * Find the task whose folderPath is a parent directory of the given file path.
   * Returns the most specific match (longest folderPath).
   */
  findTaskContainingFile(filePath) {
    const db2 = getDb();
    const normalized = path.normalize(filePath);
    const tasks = db2.prepare("SELECT * FROM tasks ORDER BY length(folder_path) DESC").all().map(rowToTask);
    return tasks.find((t) => {
      const fp = t.folderPath;
      return normalized.startsWith(fp + "/") || normalized.startsWith(fp + "\\");
    }) || null;
  }
  create(params) {
    const db2 = getDb();
    const id = uuid.v4();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const normalizedPath = normalizeFolderPath(params.folderPath);
    db2.prepare(
      `INSERT INTO tasks (id, folder_path, folder_name, status, oss_prefix, source_type, source_machine_id, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)`
    ).run(id, normalizedPath, params.folderName, params.ossPrefix || "", params.sourceType || "local", params.sourceMachineId || null, now, now);
    return this.getById(id);
  }
  updateStatus(id, status, errorMessage) {
    const db2 = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const completedAt = status === "completed" || status === "failed" ? now : null;
    db2.prepare(
      "UPDATE tasks SET status = ?, error_message = ?, updated_at = ?, completed_at = COALESCE(?, completed_at) WHERE id = ?"
    ).run(status, errorMessage || null, now, completedAt, id);
  }
  updateProgress(id, uploadedFiles, uploadedBytes) {
    const db2 = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    db2.prepare(
      "UPDATE tasks SET uploaded_files = ?, uploaded_bytes = ?, updated_at = ? WHERE id = ?"
    ).run(uploadedFiles, uploadedBytes, now, id);
  }
  setTotals(id, totalFiles, totalBytes) {
    const db2 = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    db2.prepare(
      "UPDATE tasks SET total_files = ?, total_bytes = ?, updated_at = ? WHERE id = ?"
    ).run(totalFiles, totalBytes, now, id);
  }
  // ---- task_files ----
  createFile(taskId, relativePath, fileSize) {
    const db2 = getDb();
    const id = uuid.v4();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    db2.prepare(
      `INSERT INTO task_files (id, task_id, relative_path, file_size, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`
    ).run(id, taskId, relativePath, fileSize, now, now);
    return rowToTaskFile(db2.prepare("SELECT * FROM task_files WHERE id = ?").get(id));
  }
  bulkCreateFiles(taskId, files) {
    const db2 = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const stmt = db2.prepare(
      `INSERT INTO task_files (id, task_id, relative_path, file_size, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`
    );
    const transaction = db2.transaction(() => {
      for (const f of files) {
        stmt.run(uuid.v4(), taskId, f.relativePath, f.fileSize, now, now);
      }
    });
    transaction();
  }
  listFiles(taskId, status) {
    const db2 = getDb();
    if (status) {
      return db2.prepare("SELECT * FROM task_files WHERE task_id = ? AND status = ?").all(taskId, status).map(rowToTaskFile);
    }
    return db2.prepare("SELECT * FROM task_files WHERE task_id = ?").all(taskId).map(rowToTaskFile);
  }
  updateFileStatus(fileId, status, ossKey, uploadId, errorMessage) {
    const db2 = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    db2.prepare(
      "UPDATE task_files SET status = ?, oss_key = COALESCE(?, oss_key), upload_id = COALESCE(?, upload_id), error_message = ?, updated_at = ? WHERE id = ?"
    ).run(status, ossKey || null, uploadId || null, errorMessage || null, now, fileId);
  }
  getUnfinishedTasks() {
    const db2 = getDb();
    return db2.prepare("SELECT * FROM tasks WHERE status IN ('pending', 'uploading', 'scanning') ORDER BY created_at ASC").all().map(rowToTask);
  }
  getCompletedForCleanup(retentionDays) {
    const db2 = getDb();
    const cutoff = new Date(Date.now() - retentionDays * 864e5).toISOString();
    return db2.prepare(
      `SELECT * FROM tasks WHERE status = 'completed' AND source_type IN ('local', 'rsync') AND completed_at IS NOT NULL AND completed_at < ? ORDER BY completed_at ASC`
    ).all(cutoff).map(rowToTask);
  }
}
let instance$b = null;
function getTaskRepo() {
  if (!instance$b) instance$b = new TaskRepo();
  return instance$b;
}
const DEFAULT_SETTINGS = {
  scan: {
    directories: [],
    intervalSeconds: 30
  },
  upload: {
    maxConcurrentTasks: 5,
    maxFilesPerTask: 6,
    maxConcurrentUploads: 30,
    multipartThreshold: 100 * 1024 * 1024,
    // 100MB
    startAfterTime: "20:30",
    endBeforeTime: "23:59"
  },
  oss: {
    endpoint: "",
    bucket: "",
    region: "",
    prefix: "",
    accessKeyId: "",
    accessKeySecret: ""
  },
  filter: {
    whitelist: [],
    blacklist: [],
    regex: [],
    suffixes: [".jpg", ".jpeg", ".png", ".bmp", ".csv", ".json", ".log", ".txt"]
  },
  webhook: {
    url: "",
    headers: {},
    enabled: false
  },
  hotkey: "CommandOrControl+Shift+U",
  stability: {
    checkIntervalMs: 5e3,
    checkCount: 3
  },
  log: {
    directory: "",
    // 空字符串表示使用默认 userData/logs
    maxDays: 30
  },
  dataCollect: {
    enabled: false
  },
  cleanup: {
    enabled: false,
    retentionDays: 7
  }
};
const MARKER_FILES = {
  TMP_UPLOAD: "tmp_upload.json",
  PROCESS_TASK: "process_task.json"
};
function normalizeSuffixes(suffixes) {
  const normalized = suffixes.map((suffix) => suffix.trim().toLowerCase()).filter(Boolean).map((suffix) => suffix.startsWith(".") ? suffix : `.${suffix}`);
  const unique = Array.from(new Set(normalized));
  if (!unique.includes(".csv")) unique.push(".csv");
  return unique;
}
class SettingsRepo {
  get(key) {
    const db2 = getDb();
    const row = db2.prepare("SELECT value FROM settings WHERE key = ?").get(key);
    if (!row) return null;
    try {
      const parsed = JSON.parse(row.value);
      if (key === "filter" && typeof parsed === "object" && parsed !== null && "suffixes" in parsed && Array.isArray(parsed.suffixes)) {
        const filter = parsed;
        filter.suffixes = normalizeSuffixes(filter.suffixes);
      }
      return parsed;
    } catch {
      return row.value;
    }
  }
  set(key, value) {
    const db2 = getDb();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    let persistedValue = value;
    if (key === "filter" && typeof value === "object" && value !== null && "suffixes" in value && Array.isArray(value.suffixes)) {
      const filter = value;
      persistedValue = {
        ...filter,
        suffixes: normalizeSuffixes(filter.suffixes)
      };
    }
    const serialized = typeof persistedValue === "string" ? persistedValue : JSON.stringify(persistedValue);
    db2.prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?"
    ).run(key, serialized, now, serialized, now);
  }
  getAll() {
    const settings = { ...DEFAULT_SETTINGS };
    const keys = [
      { section: "scan", key: "scan" },
      { section: "upload", key: "upload" },
      { section: "oss", key: "oss" },
      { section: "filter", key: "filter" },
      { section: "webhook", key: "webhook" },
      { section: "stability", key: "stability" },
      { section: "log", key: "log" },
      { section: "dataCollect", key: "dataCollect" }
    ];
    for (const { section, key } of keys) {
      const val = this.get(key);
      if (val !== null) {
        const defaultSection = settings[section];
        if (typeof defaultSection === "object" && defaultSection !== null && typeof val === "object" && val !== null) {
          settings[section] = {
            ...defaultSection,
            ...val
          };
        } else {
          settings[section] = val;
        }
      }
    }
    const hotkey = this.get("hotkey");
    if (hotkey) settings.hotkey = hotkey;
    if (settings.filter && Array.isArray(settings.filter.suffixes)) {
      settings.filter.suffixes = normalizeSuffixes(settings.filter.suffixes);
    }
    return settings;
  }
  saveAll(partial) {
    const db2 = getDb();
    const transaction = db2.transaction(() => {
      for (const [key, value] of Object.entries(partial)) {
        if (value !== void 0) {
          this.set(key, value);
        }
      }
    });
    transaction();
  }
}
let instance$a = null;
function getSettingsRepo() {
  if (!instance$a) instance$a = new SettingsRepo();
  return instance$a;
}
function rowToHistory(row) {
  return {
    id: row.id,
    folderName: row.folder_name,
    fileCount: row.total_files,
    totalBytes: row.total_bytes,
    durationSeconds: row.duration_seconds,
    status: row.status,
    completedAt: row.completed_at
  };
}
class HistoryRepo {
  list(query) {
    const db2 = getDb();
    const { page, pageSize, status } = query;
    const offset = (page - 1) * pageSize;
    let where = "WHERE status IN ('completed', 'failed') AND completed_at IS NOT NULL";
    const params = [];
    if (status) {
      where += " AND status = ?";
      params.push(status);
    }
    const countRow = db2.prepare(`SELECT COUNT(*) as cnt FROM tasks ${where}`).get(...params);
    const total = countRow.cnt;
    const rows = db2.prepare(
      `SELECT id, folder_name, total_files, total_bytes, status, completed_at,
         CAST((julianday(completed_at) - julianday(created_at)) * 86400 AS INTEGER) as duration_seconds
         FROM tasks ${where} ORDER BY completed_at DESC LIMIT ? OFFSET ?`
    ).all(...params, pageSize, offset);
    return { items: rows.map(rowToHistory), total };
  }
  clear(before) {
    const db2 = getDb();
    if (before) {
      db2.prepare("DELETE FROM tasks WHERE status IN ('completed', 'failed') AND completed_at < ?").run(before);
    } else {
      db2.prepare("DELETE FROM tasks WHERE status IN ('completed', 'failed')").run();
    }
  }
  deleteById(id) {
    const db2 = getDb();
    db2.prepare("DELETE FROM tasks WHERE id = ? AND status IN ('completed', 'failed')").run(id);
  }
}
let instance$9 = null;
function getHistoryRepo() {
  if (!instance$9) instance$9 = new HistoryRepo();
  return instance$9;
}
const MAX_ITEMS = 100;
class DataCollectService {
  cache = /* @__PURE__ */ new Map();
  getAll() {
    return Array.from(this.cache.values());
  }
  getByPath(folderPath) {
    return this.cache.get(folderPath) || null;
  }
  /**
   * 采集单个数据文件夹的元信息
   * 前提：文件夹中必须含有 welding_state/weld_signal.csv
   * @returns DataCollectInfo 或 null（不满足数采条件时）
   */
  collectDataInfo(folderPath) {
    const weldSignalPath = path.join(folderPath, "welding_state", "weld_signal.csv");
    if (!fs.existsSync(weldSignalPath)) {
      return null;
    }
    const folderName = path.basename(folderPath);
    const dateStr = parseDateFromPath(folderPath);
    const info = {
      folderPath,
      folderName,
      date: dateStr,
      sessionTime: folderName,
      weldSignal: {
        arcStartUs: null,
        arcEndUs: null,
        arcStartTime: null,
        arcEndTime: null,
        durationSeconds: null
      },
      cameras: [],
      robotState: {
        jointStateRows: 0,
        toolPoseRows: 0,
        hasCalibration: false
      },
      controlCmd: {
        speedRows: 0,
        freqRows: 0
      },
      pointCloudCount: 0,
      depthImageCount: 0,
      annotation: {
        hasXml: false,
        dataType: null,
        qualityType: null,
        specMin: null,
        specMax: null
      },
      totalFileCount: 0,
      totalSizeBytes: 0,
      collectedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    try {
      const { startTime, endTime } = readWeldSignal(weldSignalPath);
      info.weldSignal.arcStartUs = startTime;
      info.weldSignal.arcEndUs = endTime;
      info.weldSignal.arcStartTime = usToTimeStr(dateStr, startTime);
      info.weldSignal.arcEndTime = usToTimeStr(dateStr, endTime);
      if (startTime !== null && endTime !== null) {
        info.weldSignal.durationSeconds = Math.round((endTime - startTime) / 1e3) / 1e3;
      }
    } catch (err) {
      log.warn("读取焊接信号失败:", err);
    }
    try {
      const entries = fs.readdirSync(folderPath, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name.startsWith("camera")).sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        const camPath = path.join(folderPath, entry.name);
        const { tsMin, tsMax, count } = getImageTimestampRange(camPath);
        info.cameras.push({
          name: entry.name,
          imageCount: count,
          tsMinUs: tsMin,
          tsMaxUs: tsMax,
          tsMinTime: usToTimeStr(dateStr, tsMin),
          tsMaxTime: usToTimeStr(dateStr, tsMax)
        });
      }
    } catch {
    }
    const jointCsv = path.join(folderPath, "robot_state", "joint_state.csv");
    if (fs.existsSync(jointCsv)) {
      info.robotState.jointStateRows = readCsvTimestamps(jointCsv).count;
    }
    const toolCsv = path.join(folderPath, "robot_state", "tool_pose.csv");
    if (fs.existsSync(toolCsv)) {
      info.robotState.toolPoseRows = readCsvTimestamps(toolCsv).count;
    }
    const calibCsv = path.join(folderPath, "robot_state", "calibration.csv");
    info.robotState.hasCalibration = fs.existsSync(calibCsv);
    const speedCsv = path.join(folderPath, "control_cmd", "control_speed.csv");
    if (fs.existsSync(speedCsv)) {
      info.controlCmd.speedRows = readCsvTimestamps(speedCsv).count;
    }
    const freqCsv = path.join(folderPath, "control_cmd", "control_freq.csv");
    if (fs.existsSync(freqCsv)) {
      info.controlCmd.freqRows = readCsvTimestamps(freqCsv).count;
    }
    const pcDir = path.join(folderPath, "scan_point_cloud");
    info.pointCloudCount = countFiles(pcDir, ".bin") + countFiles(pcDir, ".ply");
    const depthDir = path.join(folderPath, "camera_depth");
    info.depthImageCount = countFiles(depthDir, ".jpg") + countFiles(depthDir, ".ply");
    const xmlPath = path.join(folderPath, "annotation", "segment_timestamps.xml");
    if (fs.existsSync(xmlPath)) {
      info.annotation.hasXml = true;
      try {
        const xmlContent = fs.readFileSync(xmlPath, "utf-8");
        info.annotation.dataType = extractXmlTag(xmlContent, "data_type");
        info.annotation.qualityType = extractXmlTag(xmlContent, "quality_type");
        const specMin = extractXmlTag(xmlContent, "data_spec_min");
        const specMax = extractXmlTag(xmlContent, "data_spec_max");
        if (specMin !== null) info.annotation.specMin = parseInt(specMin);
        if (specMax !== null) info.annotation.specMax = parseInt(specMax);
      } catch {
      }
    }
    const { fileCount, totalSize } = walkDirStats(folderPath);
    info.totalFileCount = fileCount;
    info.totalSizeBytes = totalSize;
    this.cache.set(folderPath, info);
    if (this.cache.size > MAX_ITEMS) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    log.info(`[数采模式] ${folderName}: 焊接${info.weldSignal.durationSeconds ?? "N/A"}s, ${info.cameras.length}相机, ${info.totalFileCount}文件`);
    return info;
  }
}
function parseDateFromPath(path2) {
  const pat = /(\d{4}-\d{2}-\d{2})/;
  const parts = path2.replace(/\\/g, "/").split("/").reverse();
  for (const part of parts) {
    const m = pat.exec(part);
    if (m) return m[1];
  }
  return null;
}
function usToTimeStr(dateStr, microseconds) {
  if (dateStr === null || microseconds === null) return null;
  try {
    const base = /* @__PURE__ */ new Date(dateStr + "T00:00:00");
    const ms = microseconds / 1e3;
    const ts = new Date(base.getTime() + ms);
    const pad = (n, d = 2) => String(n).padStart(d, "0");
    return `${ts.getFullYear()}-${pad(ts.getMonth() + 1)}-${pad(ts.getDate())} ${pad(ts.getHours())}:${pad(ts.getMinutes())}:${pad(ts.getSeconds())}.${pad(ts.getMilliseconds(), 3)}`;
  } catch {
    return String(microseconds);
  }
}
function readWeldSignal(filePath) {
  let startTime = null;
  let endTime = null;
  const content = fs.readFileSync(filePath, "utf-8");
  const pat = /^\s*(\d+)\s+[^:]*:\s*(true|false)\s*$/i;
  const tsPat = /(\d+)/;
  const boolPat = /(true|false)/i;
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    let ts;
    let valTrue;
    const m = pat.exec(line);
    if (m) {
      ts = parseInt(m[1]);
      valTrue = m[2].toLowerCase() === "true";
    } else {
      const tsMatch = tsPat.exec(line);
      const boolMatch = boolPat.exec(line);
      if (!tsMatch || !boolMatch) continue;
      ts = parseInt(tsMatch[1]);
      valTrue = boolMatch[1].toLowerCase() === "true";
    }
    if (valTrue) {
      if (startTime === null) startTime = ts;
    } else {
      endTime = ts;
    }
  }
  return { startTime, endTime };
}
function readCsvTimestamps(filePath) {
  let tsMin = null;
  let tsMax = null;
  let count = 0;
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      const parts = line.split(/[,\s]+/);
      if (!parts[0]) continue;
      const ts = parseInt(parts[0]);
      if (isNaN(ts)) continue;
      count++;
      if (tsMin === null || ts < tsMin) tsMin = ts;
      if (tsMax === null || ts > tsMax) tsMax = ts;
    }
  } catch {
  }
  return { tsMin, tsMax, count };
}
function countFiles(folderPath, ext) {
  if (!fs.existsSync(folderPath)) return 0;
  try {
    const entries = fs.readdirSync(folderPath);
    let count = 0;
    for (const entry of entries) {
      if (ext && !entry.toLowerCase().endsWith(ext)) continue;
      try {
        const stat = fs.statSync(path.join(folderPath, entry));
        if (stat.isFile()) count++;
      } catch {
      }
    }
    return count;
  } catch {
    return 0;
  }
}
function getImageTimestampRange(folderPath) {
  let tsMin = null;
  let tsMax = null;
  let count = 0;
  if (!fs.existsSync(folderPath)) return { tsMin, tsMax, count };
  try {
    const entries = fs.readdirSync(folderPath);
    for (const filename of entries) {
      if (!filename.toLowerCase().endsWith(".jpg")) continue;
      const nameNoExt = filename.slice(0, filename.lastIndexOf("."));
      const ts = parseInt(nameNoExt);
      if (isNaN(ts)) continue;
      count++;
      if (tsMin === null || ts < tsMin) tsMin = ts;
      if (tsMax === null || ts > tsMax) tsMax = ts;
    }
  } catch {
  }
  return { tsMin, tsMax, count };
}
function extractXmlTag(xml, tagName) {
  const re = new RegExp(`<${tagName}>\\s*([^<]*)\\s*</${tagName}>`);
  const m = re.exec(xml);
  return m ? m[1].trim() : null;
}
function walkDirStats(dirPath) {
  let fileCount = 0;
  let totalSize = 0;
  function walk(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          fileCount++;
          try {
            totalSize += fs.statSync(fullPath).size;
          } catch {
          }
        }
      }
    } catch {
    }
  }
  walk(dirPath);
  return { fileCount, totalSize };
}
let instance$8 = null;
function getDataCollectService() {
  if (!instance$8) instance$8 = new DataCollectService();
  return instance$8;
}
function readTmpUpload(folderPath) {
  const filePath = path.join(folderPath, MARKER_FILES.TMP_UPLOAD);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}
function writeTmpUpload(folderPath, marker) {
  const filePath = path.join(folderPath, MARKER_FILES.TMP_UPLOAD);
  fs.writeFileSync(filePath, JSON.stringify(marker, null, 2), "utf-8");
}
function writeProcessTask(folderPath, marker) {
  const filePath = path.join(folderPath, MARKER_FILES.PROCESS_TASK);
  fs.writeFileSync(filePath, JSON.stringify(marker, null, 2), "utf-8");
}
class ScannerService {
  timer = null;
  stabilityTimer = null;
  running = false;
  lastScanAt = null;
  nextScanAt = null;
  pendingDirs = /* @__PURE__ */ new Map();
  lastScanResults = null;
  start() {
    if (this.running) return;
    this.running = true;
    const settings = getSettingsRepo();
    const scanConfig = settings.get("scan");
    const intervalMs = (scanConfig?.intervalSeconds || 30) * 1e3;
    this.scan();
    this.timer = setInterval(() => this.scan(), intervalMs);
    const stabilityConfig = settings.get("stability");
    const checkInterval = stabilityConfig?.checkIntervalMs || 5e3;
    this.stabilityTimer = setInterval(() => this.checkStability(), checkInterval);
    log.info("扫描器已启动, 间隔:", intervalMs / 1e3, "秒");
  }
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.stabilityTimer) {
      clearInterval(this.stabilityTimer);
      this.stabilityTimer = null;
    }
    this.running = false;
    this.nextScanAt = null;
    log.info("扫描器已停止");
    this.broadcastStatus();
  }
  isRunning() {
    return this.running;
  }
  getStatus() {
    const settings = getSettingsRepo();
    const scanConfig = settings.get("scan");
    const stabilityConfig = settings.get("stability");
    const requiredChecks = stabilityConfig?.checkCount || 3;
    const pendingStabilityChecks = [];
    for (const [, pending] of this.pendingDirs) {
      pendingStabilityChecks.push({
        path: pending.path,
        checks: pending.checks,
        requiredChecks,
        discoveredAt: pending.discoveredAt
      });
    }
    return {
      running: this.running,
      lastScanAt: this.lastScanAt,
      nextScanAt: this.nextScanAt,
      watchedDirectories: scanConfig?.directories || [],
      pendingStabilityChecks,
      lastScanResults: this.lastScanResults
    };
  }
  /** 手动触发一次扫描 */
  triggerScan() {
    this.scan();
  }
  scan() {
    const settings = getSettingsRepo();
    const scanConfig = settings.get("scan");
    const directories = scanConfig?.directories || [];
    const intervalMs = (scanConfig?.intervalSeconds || 30) * 1e3;
    let scannedDirs = 0;
    let newDirsFound = 0;
    let existingDirs = 0;
    for (const dir of directories) {
      if (!fs.existsSync(dir)) {
        log.warn("扫描目录不存在:", dir);
        continue;
      }
      const result = this.scanDirectory(dir);
      scannedDirs += result.scanned;
      newDirsFound += result.newFound;
      existingDirs += result.existing;
    }
    this.lastScanAt = (/* @__PURE__ */ new Date()).toISOString();
    this.nextScanAt = new Date(Date.now() + intervalMs).toISOString();
    this.lastScanResults = {
      scannedDirs,
      newDirsFound,
      existingDirs,
      timestamp: this.lastScanAt
    };
    this.broadcastStatus();
  }
  scanDirectory(parentDir) {
    let scanned = 0;
    let newFound = 0;
    let existing = 0;
    try {
      const entries = fs.readdirSync(parentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith(".")) continue;
        scanned++;
        const subDirPath = path.join(parentDir, entry.name);
        const existingMarker = readTmpUpload(subDirPath);
        if (existingMarker) {
          this.ensureTaskRegistered(subDirPath, entry.name);
          existing++;
          continue;
        }
        if (!this.pendingDirs.has(subDirPath)) {
          log.info("发现新目录, 加入稳定性检查:", subDirPath);
          this.pendingDirs.set(subDirPath, {
            path: subDirPath,
            checks: 0,
            discoveredAt: (/* @__PURE__ */ new Date()).toISOString(),
            lastSnapshot: this.snapshotDir(subDirPath)
          });
          newFound++;
        }
      }
    } catch (err) {
      log.error("扫描目录失败:", parentDir, err);
    }
    return { scanned, newFound, existing };
  }
  checkStability() {
    if (this.pendingDirs.size === 0) return;
    const settings = getSettingsRepo();
    const stabilityConfig = settings.get("stability");
    const requiredChecks = stabilityConfig?.checkCount || 3;
    let changed = false;
    for (const [dirPath, pending] of this.pendingDirs) {
      const currentSnapshot = this.snapshotDir(dirPath);
      const isStable = this.compareSnapshots(pending.lastSnapshot, currentSnapshot);
      if (isStable) {
        pending.checks++;
        log.info(`目录稳定性检查 ${pending.checks}/${requiredChecks}:`, dirPath);
        if (pending.checks >= requiredChecks) {
          this.registerNewDir(dirPath);
          this.pendingDirs.delete(dirPath);
        }
        changed = true;
      } else {
        pending.checks = 0;
        pending.lastSnapshot = currentSnapshot;
        changed = true;
      }
    }
    if (changed) {
      this.broadcastStatus();
    }
  }
  registerNewDir(dirPath) {
    const folderName = path.basename(dirPath);
    const marker = {
      version: 1,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      folderPath: dirPath,
      metadata: { source: "local" }
    };
    writeTmpUpload(dirPath, marker);
    this.ensureTaskRegistered(dirPath, folderName);
    log.info("新目录已注册为上传任务:", dirPath);
    const settings = getSettingsRepo();
    const dataCollectConfig = settings.get("dataCollect");
    if (dataCollectConfig?.enabled) {
      try {
        const dcService = getDataCollectService();
        const info = dcService.collectDataInfo(dirPath);
        if (info) {
          for (const win of electron.BrowserWindow.getAllWindows()) {
            win.webContents.send(IPC.DATA_COLLECT_RESULT, info);
          }
        }
      } catch (err) {
        log.warn("数采分析失败:", dirPath, err);
      }
    }
  }
  ensureTaskRegistered(dirPath, folderName) {
    const taskRepo = getTaskRepo();
    const existing = taskRepo.getByFolderPath(dirPath);
    if (!existing || existing.status === "completed" || existing.status === "failed") {
      const settings = getSettingsRepo();
      const ossPrefix = settings.get("oss") ? settings.get("oss")?.prefix || "" : "";
      if (existing && (existing.status === "completed" || existing.status === "failed")) {
        return;
      }
      if (!existing) {
        taskRepo.create({
          folderPath: dirPath,
          folderName,
          ossPrefix
        });
      }
    }
  }
  broadcastStatus() {
    const status = this.getStatus();
    for (const win of electron.BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.SCANNER_EVENT, status);
    }
  }
  /** 快照目录中所有文件的 size 和 mtime */
  snapshotDir(dirPath) {
    const snapshot = /* @__PURE__ */ new Map();
    this.walkForSnapshot(dirPath, dirPath, snapshot);
    return snapshot;
  }
  walkForSnapshot(basePath, currentPath, snapshot) {
    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        if (entry.isDirectory()) {
          if (!entry.name.startsWith(".")) {
            this.walkForSnapshot(basePath, fullPath, snapshot);
          }
        } else if (entry.isFile()) {
          try {
            const stat = fs.statSync(fullPath);
            const relPath = fullPath.slice(basePath.length + 1);
            snapshot.set(relPath, { size: stat.size, mtimeMs: stat.mtimeMs });
          } catch {
          }
        }
      }
    } catch {
    }
  }
  compareSnapshots(prev, curr) {
    if (prev.size !== curr.size) return false;
    for (const [key, prevVal] of prev) {
      const currVal = curr.get(key);
      if (!currVal) return false;
      if (prevVal.size !== currVal.size || prevVal.mtimeMs !== currVal.mtimeMs) {
        return false;
      }
    }
    return true;
  }
}
let instance$7 = null;
function getScannerService() {
  if (!instance$7) instance$7 = new ScannerService();
  return instance$7;
}
class TaskQueueService extends events.EventEmitter {
  runningTasks = /* @__PURE__ */ new Map();
  processTimer = null;
  taskRunner = null;
  setTaskRunner(runner) {
    this.taskRunner = runner;
  }
  start() {
    this.processTimer = setInterval(() => this.processQueue(), 2e3);
    this.processQueue();
    log.info("任务队列已启动");
  }
  stop() {
    if (this.processTimer) {
      clearInterval(this.processTimer);
      this.processTimer = null;
    }
    log.info("任务队列已停止");
  }
  getRunningCount() {
    return this.runningTasks.size;
  }
  isTaskRunning(taskId) {
    return this.runningTasks.has(taskId);
  }
  cancelRunningTask(taskId) {
    const running = this.runningTasks.get(taskId);
    if (running) {
      running.cancel();
      this.runningTasks.delete(taskId);
    }
  }
  async processQueue() {
    if (!this.taskRunner) return;
    const settings = getSettingsRepo();
    const uploadConfig = settings.get("upload");
    if (!this.isWithinUploadWindow(uploadConfig?.startAfterTime, uploadConfig?.endBeforeTime)) return;
    const maxConcurrent = uploadConfig?.maxConcurrentTasks || 5;
    const taskRepo = getTaskRepo();
    const availableSlots = maxConcurrent - this.runningTasks.size;
    if (availableSlots <= 0) return;
    const pendingTasks = taskRepo.listByStatus("pending");
    const eligibleTasks = pendingTasks.filter(
      (task) => this.isTaskEligibleForCurrentStartCycle(task, uploadConfig?.startAfterTime)
    );
    const toRun = eligibleTasks.slice(0, availableSlots);
    for (const task of toRun) {
      this.executeTask(task);
    }
  }
  async executeTask(task) {
    const taskRepo = getTaskRepo();
    const controller = new AbortController();
    this.runningTasks.set(task.id, { cancel: () => controller.abort() });
    try {
      taskRepo.updateStatus(task.id, "uploading");
      this.emit("task:status-change", {
        taskId: task.id,
        oldStatus: task.status,
        newStatus: "uploading"
      });
      await this.taskRunner(task, controller.signal);
      if (!controller.signal.aborted) {
        taskRepo.updateStatus(task.id, "completed");
        this.emit("task:status-change", {
          taskId: task.id,
          oldStatus: "uploading",
          newStatus: "completed"
        });
        log.info("任务完成:", task.folderPath);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        const errMsg = err instanceof Error ? err.message : String(err);
        taskRepo.updateStatus(task.id, "failed", errMsg);
        this.emit("task:status-change", {
          taskId: task.id,
          oldStatus: "uploading",
          newStatus: "failed"
        });
        log.error("任务失败:", task.folderPath, errMsg);
      }
    } finally {
      this.runningTasks.delete(task.id);
    }
  }
  isWithinUploadWindow(startAfterTime, endBeforeTime) {
    const startMinutes = this.parseMinutes(startAfterTime);
    const endMinutes = this.parseMinutes(endBeforeTime);
    const now = /* @__PURE__ */ new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    if (startMinutes === null && endMinutes === null) return true;
    if (startMinutes !== null && endMinutes === null) {
      return currentMinutes >= startMinutes;
    }
    if (startMinutes === null && endMinutes !== null) {
      return currentMinutes <= endMinutes;
    }
    if (startMinutes === null || endMinutes === null) return true;
    if (startMinutes === endMinutes) return true;
    if (startMinutes < endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    }
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
  parseMinutes(time) {
    if (!time || !time.trim()) return null;
    const match = time.match(/^(\d{1,2}):(\d{1,2})$/);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return hour * 60 + minute;
  }
  isTaskEligibleForCurrentStartCycle(task, startAfterTime) {
    const startMinutes = this.parseMinutes(startAfterTime);
    if (startMinutes === null) return true;
    const cycleStart = this.getCurrentStartCycleStart(startMinutes, /* @__PURE__ */ new Date());
    const createdAtMs = new Date(task.createdAt).getTime();
    if (Number.isNaN(createdAtMs)) return true;
    return createdAtMs <= cycleStart.getTime();
  }
  getCurrentStartCycleStart(startMinutes, now) {
    const todayStart = new Date(now);
    todayStart.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
    if (now.getTime() >= todayStart.getTime()) {
      return todayStart;
    }
    const previousStart = new Date(todayStart);
    previousStart.setDate(previousStart.getDate() - 1);
    return previousStart;
  }
}
let instance$6 = null;
function getTaskQueueService() {
  if (!instance$6) instance$6 = new TaskQueueService();
  return instance$6;
}
class SSHRsyncService {
  runningProcesses = /* @__PURE__ */ new Map();
  /**
   * 测试 SSH 连接
   */
  async testConnection(machine, password) {
    return new Promise((resolve) => {
      const client = new ssh2.Client();
      const timeout = setTimeout(() => {
        client.end();
        resolve({ ok: false, error: "连接超时 (10s)" });
      }, 1e4);
      client.on("ready", () => {
        clearTimeout(timeout);
        client.end();
        resolve({ ok: true });
      });
      client.on("error", (err) => {
        clearTimeout(timeout);
        resolve({ ok: false, error: err.message });
      });
      const connectOpts = {
        host: machine.host,
        port: machine.port,
        username: machine.username
      };
      if (machine.authType === "key" && machine.privateKeyPath) {
        try {
          connectOpts.privateKey = fs.readFileSync(machine.privateKeyPath);
        } catch (err) {
          resolve({ ok: false, error: `无法读取密钥文件: ${err}` });
          return;
        }
      } else if (password) {
        connectOpts.password = password;
      }
      client.connect(connectOpts);
    });
  }
  /**
   * 执行 rsync 拉取
   */
  async startRsync(machine, password, onProgress) {
    if (this.runningProcesses.has(machine.id)) {
      throw new Error("该机器已有传输进程在运行");
    }
    return new Promise((resolve, reject) => {
      const args = this.buildRsyncArgs(machine);
      const env = { ...process.env };
      let cmd;
      let cmdArgs;
      if (machine.authType === "password" && password) {
        cmd = "sshpass";
        cmdArgs = ["-p", password, "rsync", ...args];
      } else {
        cmd = "rsync";
        cmdArgs = args;
      }
      log.info(`rsync 启动: ${cmd} ${cmdArgs.join(" ")}`);
      const proc = child_process.spawn(cmd, cmdArgs, { env });
      this.runningProcesses.set(machine.id, proc);
      let stderr = "";
      proc.stdout?.on("data", (data) => {
        const line = data.toString();
        const progress = this.parseRsyncProgress(machine.id, line);
        if (progress && onProgress) {
          onProgress(progress);
        }
      });
      proc.stderr?.on("data", (data) => {
        stderr += data.toString();
      });
      proc.on("close", (code) => {
        this.runningProcesses.delete(machine.id);
        if (code === 0) {
          log.info(`rsync 完成: ${machine.name}`);
          resolve();
        } else {
          const err = `rsync 退出码 ${code}: ${stderr}`;
          log.error(err);
          reject(new Error(err));
        }
      });
      proc.on("error", (err) => {
        this.runningProcesses.delete(machine.id);
        reject(err);
      });
    });
  }
  /**
   * SFTP 流式直传到 OSS（不落盘）
   */
  async sftpStreamToOSS(machine, password, ossService, ossConfig, onProgress) {
    if (this.runningProcesses.has(machine.id)) {
      throw new Error("该机器已有传输进程在运行");
    }
    ossService.configure(ossConfig);
    const client = new ssh2.Client();
    this.runningProcesses.set(machine.id, client);
    return new Promise((resolve, reject) => {
      const connectOpts = {
        host: machine.host,
        port: machine.port,
        username: machine.username
      };
      if (machine.authType === "key" && machine.privateKeyPath) {
        try {
          connectOpts.privateKey = fs.readFileSync(machine.privateKeyPath);
        } catch (err) {
          this.runningProcesses.delete(machine.id);
          reject(new Error(`无法读取密钥文件: ${err}`));
          return;
        }
      } else if (password) {
        connectOpts.password = password;
      }
      client.on("error", (err) => {
        this.runningProcesses.delete(machine.id);
        reject(err);
      });
      client.on("ready", () => {
        client.sftp(async (err, sftp) => {
          if (err) {
            client.end();
            this.runningProcesses.delete(machine.id);
            reject(err);
            return;
          }
          try {
            await this.sftpUploadDir(
              sftp,
              machine,
              ossService,
              ossConfig.prefix || "",
              onProgress
            );
            client.end();
            this.runningProcesses.delete(machine.id);
            resolve();
          } catch (uploadErr) {
            client.end();
            this.runningProcesses.delete(machine.id);
            reject(uploadErr);
          }
        });
      });
      client.connect(connectOpts);
    });
  }
  async sftpUploadDir(sftp, machine, ossService, ossPrefix, onProgress) {
    const files = await this.sftpListFiles(sftp, machine.remoteDir, machine.remoteDir);
    log.info(`SFTP 发现 ${files.length} 个文件`);
    const folderName = path.posix.basename(machine.remoteDir);
    let uploadedCount = 0;
    for (const remoteFile of files) {
      const relativePath = remoteFile.slice(machine.remoteDir.length).replace(/^\//, "");
      const ossKey = [ossPrefix, folderName, relativePath].filter(Boolean).join("/").replace(/\/+/g, "/");
      onProgress?.({
        machineId: machine.id,
        totalFiles: files.length,
        uploadedFiles: uploadedCount,
        currentFile: relativePath,
        speed: ""
      });
      await new Promise((res, rej) => {
        const readStream = sftp.createReadStream(remoteFile);
        const chunks = [];
        readStream.on("data", (chunk) => {
          chunks.push(chunk);
        });
        readStream.on("end", async () => {
          try {
            const buffer = Buffer.concat(chunks);
            await ossService.uploadBuffer(buffer, ossKey);
            uploadedCount++;
            res();
          } catch (e) {
            rej(e);
          }
        });
        readStream.on("error", rej);
      });
    }
    onProgress?.({
      machineId: machine.id,
      totalFiles: files.length,
      uploadedFiles: uploadedCount,
      currentFile: "",
      speed: ""
    });
    log.info(`SFTP 直传完成: ${uploadedCount}/${files.length} 个文件`);
  }
  sftpListFiles(sftp, basePath, currentPath) {
    return new Promise((resolve, reject) => {
      sftp.readdir(currentPath, async (err, list) => {
        if (err) {
          reject(err);
          return;
        }
        const files = [];
        for (const item of list) {
          if (item.filename.startsWith(".")) continue;
          const fullPath = path.posix.join(currentPath, item.filename);
          if (item.attrs.isDirectory()) {
            const subFiles = await this.sftpListFiles(sftp, basePath, fullPath);
            files.push(...subFiles);
          } else if (item.attrs.isFile()) {
            files.push(fullPath);
          }
        }
        resolve(files);
      });
    });
  }
  stopRsync(machineId) {
    const running = this.runningProcesses.get(machineId);
    if (running) {
      if (running instanceof ssh2.Client) {
        running.end();
      } else {
        running.kill("SIGTERM");
      }
      this.runningProcesses.delete(machineId);
      log.info("传输已停止:", machineId);
    }
  }
  buildRsyncArgs(machine) {
    const args = [
      "-avz",
      "--partial",
      "--progress",
      `--bwlimit=${machine.bwLimit}`
    ];
    const sshCmd = machine.authType === "key" && machine.privateKeyPath ? `ssh -i ${machine.privateKeyPath} -p ${machine.port} -o StrictHostKeyChecking=no` : `ssh -p ${machine.port} -o StrictHostKeyChecking=no`;
    const remoteRsync = `nice -n ${machine.cpuNice} ionice -c 3 rsync`;
    args.push(`--rsync-path=${remoteRsync}`);
    args.push("-e", sshCmd);
    const remotePath = machine.remoteDir.endsWith("/") ? machine.remoteDir : machine.remoteDir + "/";
    const source = `${machine.username}@${machine.host}:${remotePath}`;
    const dest = machine.localDir.endsWith("/") ? machine.localDir : machine.localDir + "/";
    args.push(source, dest);
    return args;
  }
  parseRsyncProgress(machineId, line) {
    const match = line.match(/(\d+)%\s+([\d.]+\w+\/s)/);
    if (match) {
      return {
        machineId,
        percent: parseInt(match[1]),
        speed: match[2],
        file: line.trim().split("\n")[0] || ""
      };
    }
    return null;
  }
}
let instance$5 = null;
function getSSHRsyncService() {
  if (!instance$5) instance$5 = new SSHRsyncService();
  return instance$5;
}
class OSSUploadService {
  client = null;
  config = null;
  multipartThreshold = 100 * 1024 * 1024;
  // 100MB
  configure(config, multipartThreshold) {
    this.config = config;
    if (multipartThreshold) this.multipartThreshold = multipartThreshold;
    this.client = null;
  }
  async getClient() {
    if (this.client) return this.client;
    if (!this.config) throw new Error("OSS 未配置");
    const OSS = (await import("ali-oss")).default;
    this.client = new OSS({
      region: this.config.region,
      accessKeyId: this.config.accessKeyId,
      accessKeySecret: this.config.accessKeySecret,
      bucket: this.config.bucket,
      endpoint: this.config.endpoint || void 0
    });
    return this.client;
  }
  /**
   * 创建任务级独立 OSS 客户端
   * 每个任务使用自己的客户端，cancel() 不会影响其他任务
   */
  async createTaskClient() {
    if (!this.config) throw new Error("OSS 未配置");
    const OSS = (await import("ali-oss")).default;
    return new OSS({
      region: this.config.region,
      accessKeyId: this.config.accessKeyId,
      accessKeySecret: this.config.accessKeySecret,
      bucket: this.config.bucket,
      endpoint: this.config.endpoint || void 0
    });
  }
  /**
   * 上传单个文件到 OSS
   * @param filePath 本地文件绝对路径
   * @param ossKey OSS 对象 key
   * @param fileSize 文件大小
   * @param onProgress 进度回调 (0-1)
   * @param signal 取消信号
   * @param taskClient 任务级 OSS 客户端（可选，默认使用共享客户端）
   * @returns OSS key
   */
  async uploadFile(filePath, ossKey, fileSize, onProgress, signal, taskClient) {
    if (signal?.aborted) {
      throw new DOMException("Upload aborted", "AbortError");
    }
    const client = taskClient || await this.getClient();
    if (fileSize > this.multipartThreshold) {
      try {
        await client.multipartUpload(ossKey, filePath, {
          partSize: 1024 * 1024,
          // 1MB 分片
          progress: (percentage) => {
            onProgress?.(percentage);
          }
        });
      } catch (err) {
        if (signal?.aborted || err && typeof err === "object" && "name" in err && err.name === "cancel") {
          throw new DOMException("Upload aborted", "AbortError");
        }
        throw err;
      }
    } else {
      const stream = fs.createReadStream(filePath);
      const onAbort = () => {
        stream.destroy();
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        await client.put(ossKey, stream);
        onProgress?.(1);
      } catch (err) {
        if (signal?.aborted) {
          throw new DOMException("Upload aborted", "AbortError");
        }
        throw err;
      } finally {
        signal?.removeEventListener("abort", onAbort);
        stream.destroy();
      }
    }
    return ossKey;
  }
  /**
   * 上传 Buffer 到 OSS（用于 SFTP 直传场景）
   */
  async uploadBuffer(buffer, ossKey) {
    const client = await this.getClient();
    await client.put(ossKey, buffer);
    return ossKey;
  }
  async testConnection(config) {
    const endpoint = config.endpoint.trim();
    const region = config.region.trim();
    const bucket = config.bucket.trim();
    const accessKeyId = config.accessKeyId.trim();
    const accessKeySecret = config.accessKeySecret.trim();
    if (!region) return { ok: false, error: "Region 不能为空" };
    if (!bucket) return { ok: false, error: "Bucket 不能为空" };
    if (!accessKeyId) return { ok: false, error: "AccessKey ID 不能为空" };
    if (!accessKeySecret) return { ok: false, error: "AccessKey Secret 不能为空" };
    try {
      const OSS = (await import("ali-oss")).default;
      const client = new OSS({
        region,
        accessKeyId,
        accessKeySecret,
        bucket,
        endpoint: endpoint || void 0,
        timeout: "10s",
        secure: true
      });
      const result = await client.list({ "max-keys": 1 });
      const statusCode = result?.res?.status;
      if (typeof statusCode === "number" && statusCode >= 200 && statusCode < 300) {
        return { ok: true };
      }
      return { ok: false, error: `桶连接校验失败，HTTP 状态码: ${statusCode ?? "unknown"}` };
    } catch (err) {
      const e = err;
      const parts = [
        e.code || e.name,
        typeof e.status === "number" ? `status=${e.status}` : void 0,
        e.message
      ].filter(Boolean);
      return { ok: false, error: parts.join(", ") || String(err) };
    }
  }
}
let instance$4 = null;
function getOSSUploadService() {
  if (!instance$4) instance$4 = new OSSUploadService();
  return instance$4;
}
function rowToSSHMachine(row) {
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    port: row.port,
    username: row.username,
    authType: row.auth_type,
    privateKeyPath: row.private_key_path || null,
    remoteDir: row.remote_dir,
    localDir: row.local_dir,
    bwLimit: row.bw_limit,
    cpuNice: row.cpu_nice,
    transferMode: row.transfer_mode || "rsync",
    enabled: Boolean(row.enabled),
    lastSyncAt: row.last_sync_at || null,
    createdAt: row.created_at
  };
}
function registerAllIpc() {
  function broadcastStatusChange(taskId, newStatus) {
    for (const win of electron.BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.TASK_STATUS_CHANGE, { taskId, newStatus });
    }
  }
  electron.ipcMain.handle(IPC.TASK_LIST, (_event, args) => {
    return getTaskRepo().listByStatus(args?.status);
  });
  electron.ipcMain.handle(IPC.TASK_GET, (_event, args) => {
    return getTaskRepo().getById(args.taskId);
  });
  electron.ipcMain.handle(IPC.TASK_ADD_FOLDER, (_event, args) => {
    const taskRepo = getTaskRepo();
    const settingsRepo = getSettingsRepo();
    const ossSettings = settingsRepo.get("oss");
    const prefix = ossSettings?.prefix || "";
    const folderName = path.basename(args.folderPath);
    return taskRepo.create({
      folderPath: args.folderPath,
      folderName,
      ossPrefix: prefix,
      sourceType: "manual"
    });
  });
  electron.ipcMain.handle(IPC.TASK_PAUSE, (_event, args) => {
    getTaskQueueService().cancelRunningTask(args.taskId);
    getTaskRepo().updateStatus(args.taskId, "paused");
    broadcastStatusChange(args.taskId, "paused");
  });
  electron.ipcMain.handle(IPC.TASK_RESUME, (_event, args) => {
    getTaskRepo().updateStatus(args.taskId, "pending");
    broadcastStatusChange(args.taskId, "pending");
  });
  electron.ipcMain.handle(IPC.TASK_CANCEL, (_event, args) => {
    getTaskQueueService().cancelRunningTask(args.taskId);
    getTaskRepo().updateStatus(args.taskId, "failed", "用户取消");
    broadcastStatusChange(args.taskId, "failed");
  });
  electron.ipcMain.handle(IPC.TASK_RETRY, (_event, args) => {
    getTaskRepo().updateStatus(args.taskId, "pending");
    broadcastStatusChange(args.taskId, "pending");
  });
  electron.ipcMain.handle(IPC.SCANNER_STATUS, () => {
    return getScannerService().getStatus();
  });
  electron.ipcMain.handle(IPC.SCANNER_TRIGGER, () => {
    getScannerService().triggerScan();
  });
  electron.ipcMain.handle(IPC.SCANNER_START, () => {
    getScannerService().start();
  });
  electron.ipcMain.handle(IPC.SCANNER_STOP, () => {
    getScannerService().stop();
  });
  electron.ipcMain.handle(IPC.SETTINGS_GET_ALL, () => {
    return getSettingsRepo().getAll();
  });
  electron.ipcMain.handle(IPC.SETTINGS_SAVE, (_event, data) => {
    getSettingsRepo().saveAll(data);
    return { ok: true };
  });
  electron.ipcMain.handle(IPC.SETTINGS_TEST_OSS, async (_event, config) => {
    return getOSSUploadService().testConnection(config);
  });
  electron.ipcMain.handle(IPC.SSH_LIST_MACHINES, () => {
    const db2 = getDb();
    const rows = db2.prepare("SELECT * FROM ssh_machines ORDER BY created_at DESC").all();
    return rows.map(rowToSSHMachine);
  });
  electron.ipcMain.handle(IPC.SSH_ADD_MACHINE, (_event, input) => {
    const db2 = getDb();
    const id = uuid.v4();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    db2.prepare(
      `INSERT INTO ssh_machines (id, name, host, port, username, auth_type, private_key_path, encrypted_password, remote_dir, local_dir, bw_limit, cpu_nice, transfer_mode, enabled, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, input.name, input.host, input.port, input.username, input.authType, input.privateKeyPath || null, input.password || null, input.remoteDir, input.localDir, input.bwLimit, input.cpuNice, input.transferMode || "rsync", input.enabled ? 1 : 0, now);
    const row = db2.prepare("SELECT * FROM ssh_machines WHERE id = ?").get(id);
    return rowToSSHMachine(row);
  });
  electron.ipcMain.handle(IPC.SSH_UPDATE_MACHINE, (_event, machine) => {
    const db2 = getDb();
    db2.prepare(
      `UPDATE ssh_machines SET name=?, host=?, port=?, username=?, auth_type=?, private_key_path=?, remote_dir=?, local_dir=?, bw_limit=?, cpu_nice=?, enabled=? WHERE id=?`
    ).run(machine.name, machine.host, machine.port, machine.username, machine.authType, machine.privateKeyPath, machine.remoteDir, machine.localDir, machine.bwLimit, machine.cpuNice, machine.enabled ? 1 : 0, machine.id);
  });
  electron.ipcMain.handle(IPC.SSH_DELETE_MACHINE, (_event, args) => {
    const db2 = getDb();
    db2.prepare("DELETE FROM ssh_machines WHERE id = ?").run(args.id);
  });
  electron.ipcMain.handle(IPC.SSH_TEST_CONNECTION, async (_event, args) => {
    const db2 = getDb();
    const row = db2.prepare("SELECT * FROM ssh_machines WHERE id = ?").get(args.id);
    if (!row) return { ok: false, error: "机器不存在" };
    const machine = rowToSSHMachine(row);
    const password = row.encrypted_password || void 0;
    return getSSHRsyncService().testConnection(machine, password);
  });
  electron.ipcMain.handle(IPC.RSYNC_START, async (_event, args) => {
    const db2 = getDb();
    const row = db2.prepare("SELECT * FROM ssh_machines WHERE id = ?").get(args.machineId);
    if (!row) throw new Error("机器不存在");
    const machine = rowToSSHMachine(row);
    const password = row.encrypted_password || void 0;
    try {
      await getSSHRsyncService().startRsync(machine, password, (progress) => {
        for (const win of electron.BrowserWindow.getAllWindows()) {
          win.webContents.send(IPC.RSYNC_PROGRESS, progress);
        }
      });
      db2.prepare("UPDATE ssh_machines SET last_sync_at = ? WHERE id = ?").run((/* @__PURE__ */ new Date()).toISOString(), args.machineId);
      const taskRepo = getTaskRepo();
      const settingsRepo = getSettingsRepo();
      const ossSettings = settingsRepo.get("oss");
      const prefix = ossSettings?.prefix || "";
      const localDir = path.normalize(machine.localDir).replace(/[\\/]+$/, "");
      const existing = taskRepo.getByFolderPath(localDir);
      if (!existing || existing.status === "completed" || existing.status === "failed") {
        taskRepo.create({
          folderPath: localDir,
          folderName: path.basename(localDir),
          ossPrefix: prefix,
          sourceType: "rsync",
          sourceMachineId: machine.id
        });
        log.info("rsync 完成, 自动创建上传任务:", localDir);
      }
      writeTmpUpload(localDir, {
        version: 1,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        folderPath: localDir,
        metadata: { source: "rsync", machineId: machine.id }
      });
    } catch (err) {
      log.error("rsync 失败:", err);
      throw err;
    }
  });
  electron.ipcMain.handle(IPC.RSYNC_STOP, (_event, args) => {
    getSSHRsyncService().stopRsync(args.machineId);
  });
  electron.ipcMain.handle(IPC.HISTORY_LIST, (_event, query) => {
    return getHistoryRepo().list(query);
  });
  electron.ipcMain.handle(IPC.HISTORY_CLEAR, (_event, args) => {
    getHistoryRepo().clear(args?.before);
  });
  electron.ipcMain.handle(IPC.HISTORY_DELETE, (_event, args) => {
    getHistoryRepo().deleteById(args.id);
  });
  electron.ipcMain.handle(IPC.DIALOG_SELECT_FOLDER, async () => {
    const win = getMainWindow();
    if (!win) return null;
    const result = await electron.dialog.showOpenDialog(win, {
      properties: ["openDirectory"]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
  electron.ipcMain.handle(IPC.DIALOG_SELECT_DIRECTORY, async () => {
    const win = getMainWindow();
    if (!win) return null;
    const result = await electron.dialog.showOpenDialog(win, {
      properties: ["openDirectory"]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
  electron.ipcMain.handle(IPC.SFTP_START, async (_event, args) => {
    const db2 = getDb();
    const row = db2.prepare("SELECT * FROM ssh_machines WHERE id = ?").get(args.machineId);
    if (!row) throw new Error("机器不存在");
    const machine = rowToSSHMachine(row);
    const password = row.encrypted_password || void 0;
    const settingsRepo = getSettingsRepo();
    const ossConfig = settingsRepo.get("oss");
    if (!ossConfig || !ossConfig.accessKeyId) {
      throw new Error("OSS 未配置");
    }
    try {
      await getSSHRsyncService().sftpStreamToOSS(
        machine,
        password,
        getOSSUploadService(),
        ossConfig,
        (progress) => {
          for (const win of electron.BrowserWindow.getAllWindows()) {
            win.webContents.send(IPC.SFTP_PROGRESS, progress);
          }
        }
      );
      db2.prepare("UPDATE ssh_machines SET last_sync_at = ? WHERE id = ?").run((/* @__PURE__ */ new Date()).toISOString(), args.machineId);
    } catch (err) {
      log.error("SFTP 直传失败:", err);
      throw err;
    }
  });
  electron.ipcMain.handle(IPC.SFTP_STOP, (_event, args) => {
    getSSHRsyncService().stopRsync(args.machineId);
  });
  electron.ipcMain.handle(IPC.DATA_COLLECT_LIST, () => {
    return getDataCollectService().getAll();
  });
  electron.ipcMain.handle(IPC.DATA_COLLECT_RUN, (_event, args) => {
    const result = getDataCollectService().collectDataInfo(args.folderPath);
    if (result) {
      for (const win of electron.BrowserWindow.getAllWindows()) {
        win.webContents.send(IPC.DATA_COLLECT_RESULT, result);
      }
    }
    return result;
  });
  electron.ipcMain.handle(IPC.DISK_USAGE, async () => {
    const settingsRepo = getSettingsRepo();
    const scanConfig = settingsRepo.get("scan");
    const db2 = getDb();
    const paths = /* @__PURE__ */ new Set();
    if (scanConfig?.directories) {
      for (const d of scanConfig.directories) paths.add(path.normalize(d).replace(/[\\/]+$/, ""));
    }
    const sshRows = db2.prepare("SELECT local_dir FROM ssh_machines WHERE enabled = 1").all();
    for (const r of sshRows) {
      paths.add(path.normalize(r.local_dir).replace(/[\\/]+$/, ""));
    }
    const results = [];
    for (const p of paths) {
      try {
        if (!fs.existsSync(p)) continue;
        const stats = await promises.statfs(p);
        const totalBytes = stats.bsize * stats.blocks;
        const freeBytes = stats.bsize * stats.bavail;
        const usedBytes = totalBytes - freeBytes;
        const usagePercent = totalBytes > 0 ? Math.round(usedBytes / totalBytes * 100) : 0;
        results.push({ path: p, totalBytes, freeBytes, usedBytes, usagePercent });
      } catch (err) {
        log.warn("获取磁盘用量失败:", p, err);
      }
    }
    return results;
  });
  electron.ipcMain.handle(IPC.ANNOTATION_OPEN_WINDOW, () => {
    createAnnotationWindow();
  });
  electron.ipcMain.handle(IPC.ANNOTATION_SELECT_IMAGE, async (event) => {
    const win = electron.BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;
    const result = await electron.dialog.showOpenDialog(win, {
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "bmp", "tiff", "tif"] }],
      properties: ["openFile"]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
  electron.ipcMain.handle(IPC.ANNOTATION_READ_IMAGE, (_event, args) => {
    const { filePath } = args;
    const ext = path.extname(filePath).toLowerCase().replace(".", "");
    const mimeMap = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      bmp: "image/bmp",
      tiff: "image/tiff",
      tif: "image/tiff"
    };
    const mime = mimeMap[ext] || "image/png";
    const buf = fs.readFileSync(filePath);
    const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
    const img = electron.nativeImage.createFromPath(filePath);
    const size = img.getSize();
    return { dataUrl, width: size.width, height: size.height };
  });
  electron.ipcMain.handle(IPC.ANNOTATION_SAVE_EXPORT, async (event, args) => {
    const win = electron.BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;
    const result = await electron.dialog.showSaveDialog(win, {
      defaultPath: `${args.defaultBaseName}.png`,
      filters: [{ name: "PNG", extensions: ["png"] }]
    });
    if (result.canceled || !result.filePath) return null;
    const base64Data = args.dataUrl.replace(/^data:image\/\w+;base64,/, "");
    const pngPath = result.filePath;
    fs.writeFileSync(pngPath, Buffer.from(base64Data, "base64"));
    const parsed = path.parse(pngPath);
    const jsonPath = path.format({ dir: parsed.dir, name: parsed.name, ext: ".json" });
    fs.writeFileSync(jsonPath, args.jsonString, "utf-8");
    log.info("[Annotation] Exported PNG:", pngPath);
    log.info("[Annotation] Exported JSON:", jsonPath);
    return { pngPath, jsonPath };
  });
  electron.ipcMain.handle(IPC.ANNOTATION_UPLOAD_OSS, async (_event, args) => {
    const taskRepo = getTaskRepo();
    const settingsRepo = getSettingsRepo();
    const ossService = getOSSUploadService();
    const ossConfig = settingsRepo.get("oss");
    if (!ossConfig || !ossConfig.accessKeyId) {
      return { ok: false, error: "OSS 未配置" };
    }
    ossService.configure(ossConfig);
    const task = taskRepo.findTaskContainingFile(args.imagePath);
    let pngOssKey;
    let jsonOssKey;
    if (task) {
      const relPath = path.relative(task.folderPath, args.imagePath).replace(/\\/g, "/");
      const relParsed = path.parse(relPath);
      const relBase = path.format({ dir: relParsed.dir, name: relParsed.name, ext: "" });
      const prefix = task.ossPrefix || ossConfig.prefix || "";
      const folder = task.folderName;
      const basePath = [prefix, folder, relBase].filter(Boolean).join("/").replace(/\/+/g, "/");
      pngOssKey = basePath + "_annotation.png";
      jsonOssKey = basePath + "_annotation.json";
      log.info("[Annotation] Matched task:", task.id, "folderPath:", task.folderPath);
    } else {
      const prefix = ossConfig.prefix || "";
      const imgParsed = path.parse(args.imagePath);
      const basePath = [prefix, imgParsed.name].filter(Boolean).join("/").replace(/\/+/g, "/");
      pngOssKey = basePath + "_annotation.png";
      jsonOssKey = basePath + "_annotation.json";
      log.info("[Annotation] No matching task found, using config prefix");
    }
    log.info("[Annotation] Uploading PNG to:", pngOssKey);
    log.info("[Annotation] Uploading JSON to:", jsonOssKey);
    try {
      const pngBuffer = fs.readFileSync(args.pngPath);
      const jsonBuffer = fs.readFileSync(args.jsonPath);
      await Promise.all([
        ossService.uploadBuffer(pngBuffer, pngOssKey),
        ossService.uploadBuffer(jsonBuffer, jsonOssKey)
      ]);
      log.info("[Annotation] OSS upload completed");
      return { ok: true, pngOssKey, jsonOssKey };
    } catch (err) {
      log.error("[Annotation] OSS upload failed:", err);
      return { ok: false, error: String(err) };
    }
  });
}
class FileFilterService {
  rules;
  constructor(rules) {
    this.rules = rules;
  }
  updateRules(rules) {
    this.rules = rules;
  }
  /**
   * 判断单个文件是否应该被包含
   * @param relativePath 文件相对路径
   * @returns true = 包含, false = 排除
   */
  shouldInclude(relativePath) {
    const fileName = path.basename(relativePath);
    const ext = path.extname(relativePath).toLowerCase();
    if (this.rules.whitelist.length > 0) {
      for (const pattern of this.rules.whitelist) {
        if (this.matchPattern(fileName, relativePath, pattern)) {
          return true;
        }
      }
    }
    if (this.rules.blacklist.length > 0) {
      for (const pattern of this.rules.blacklist) {
        if (this.matchPattern(fileName, relativePath, pattern)) {
          return false;
        }
      }
    }
    if (this.rules.regex.length > 0) {
      for (const pattern of this.rules.regex) {
        try {
          const re = new RegExp(pattern);
          if (re.test(relativePath) || re.test(fileName)) {
            return false;
          }
        } catch {
        }
      }
    }
    if (this.rules.suffixes.length > 0) {
      return this.rules.suffixes.some((suffix) => ext === this.normalizeSuffix(suffix));
    }
    return true;
  }
  /**
   * 递归扫描文件夹，返回过滤后的文件列表
   */
  scanFolder(folderPath) {
    const results = [];
    this.walkDir(folderPath, folderPath, results);
    return results;
  }
  walkDir(basePath, currentPath, results) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".")) continue;
        this.walkDir(basePath, fullPath, results);
      } else if (entry.isFile()) {
        const relativePath = fullPath.slice(basePath.length + 1);
        if (entry.name === "tmp_upload.json" || entry.name === "process_task.json") continue;
        if (this.shouldInclude(relativePath)) {
          const stat = fs.statSync(fullPath);
          results.push({ relativePath, absolutePath: fullPath, size: stat.size });
        }
      }
    }
  }
  matchPattern(fileName, relativePath, pattern) {
    if (fileName === pattern) return true;
    if (pattern.startsWith(".") && path.extname(fileName).toLowerCase() === pattern.toLowerCase()) return true;
    if (pattern.includes("*")) {
      const regexStr = "^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$";
      try {
        const re = new RegExp(regexStr, "i");
        if (re.test(fileName) || re.test(relativePath)) return true;
      } catch {
      }
    }
    return false;
  }
  normalizeSuffix(suffix) {
    const trimmed = suffix.trim().toLowerCase();
    if (!trimmed) return "";
    return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
  }
}
class SpeedCalculator {
  samples = [];
  windowMs;
  constructor(windowMs = 5e3) {
    this.windowMs = windowMs;
  }
  addSample(bytes) {
    const now = Date.now();
    this.samples.push({ time: now, bytes });
    const cutoff = now - this.windowMs;
    this.samples = this.samples.filter((s) => s.time >= cutoff);
  }
  getSpeed() {
    if (this.samples.length < 2) return 0;
    const now = Date.now();
    const cutoff = now - this.windowMs;
    const recent = this.samples.filter((s) => s.time >= cutoff);
    if (recent.length < 2) return 0;
    const first = recent[0];
    const last = recent[recent.length - 1];
    const timeDiff = (last.time - first.time) / 1e3;
    if (timeDiff <= 0) return 0;
    const totalBytes = recent.reduce((sum, s) => sum + s.bytes, 0) - first.bytes;
    return Math.max(0, totalBytes / timeDiff);
  }
  reset() {
    this.samples = [];
  }
}
class UploadSemaphore {
  constructor(max) {
    this.max = max;
  }
  current = 0;
  waiting = [];
  setMax(max) {
    this.max = max;
    this.drain();
  }
  getMax() {
    return this.max;
  }
  getCurrent() {
    return this.current;
  }
  async acquire(signal) {
    if (signal?.aborted) {
      throw new DOMException("Semaphore acquire aborted", "AbortError");
    }
    if (this.current < this.max) {
      this.current++;
      return;
    }
    return new Promise((resolve, reject) => {
      const id = Symbol();
      const entry = {
        resolve: () => {
          this.current++;
          cleanup();
          resolve();
        },
        id
      };
      const onAbort = () => {
        const idx = this.waiting.findIndex((w) => w.id === id);
        if (idx !== -1) this.waiting.splice(idx, 1);
        cleanup();
        reject(new DOMException("Semaphore acquire aborted", "AbortError"));
      };
      const cleanup = () => {
        signal?.removeEventListener("abort", onAbort);
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      this.waiting.push(entry);
    });
  }
  release() {
    this.current--;
    this.drain();
  }
  drain() {
    while (this.waiting.length > 0 && this.current < this.max) {
      const next = this.waiting.shift();
      next.resolve();
    }
  }
}
let instance$3 = null;
function getUploadSemaphore(max) {
  if (!instance$3) {
    instance$3 = new UploadSemaphore(max ?? 30);
  } else if (max !== void 0) {
    instance$3.setMax(max);
  }
  return instance$3;
}
class TaskRunnerService {
  /**
   * 执行一个文件夹上传任务
   */
  async run(task, signal) {
    const taskRepo = getTaskRepo();
    const settings = getSettingsRepo();
    const filterRules = settings.get("filter") || {
      whitelist: [],
      blacklist: [],
      regex: [],
      suffixes: [".jpg", ".jpeg", ".png", ".csv", ".json", ".log", ".txt"]
    };
    const filter = new FileFilterService(filterRules);
    const uploadConfig = settings.get("upload");
    const maxFilesPerTask = uploadConfig?.maxFilesPerTask || 6;
    const semaphore = getUploadSemaphore(uploadConfig?.maxConcurrentUploads || 30);
    const ossConfig = settings.get("oss");
    if (!ossConfig || !ossConfig.accessKeyId) {
      throw new Error("OSS 未配置，请在设置中配置阿里云 OSS 信息");
    }
    const ossService = getOSSUploadService();
    ossService.configure(ossConfig, uploadConfig?.multipartThreshold);
    const taskClient = await ossService.createTaskClient();
    signal?.addEventListener("abort", () => {
      taskClient.cancel();
    }, { once: true });
    if (signal?.aborted) throw new DOMException("Upload cancelled", "AbortError");
    taskRepo.updateStatus(task.id, "scanning");
    const files = filter.scanFolder(task.folderPath);
    log.info(`任务 ${task.id}: 扫描到 ${files.length} 个文件`);
    if (files.length === 0) {
      log.info(`任务 ${task.id}: 无需上传的文件`);
      return;
    }
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    taskRepo.setTotals(task.id, files.length, totalBytes);
    const existingFiles = taskRepo.listFiles(task.id);
    const existingPaths = new Set(existingFiles.map((f) => f.relativePath));
    const newFiles = files.filter((f) => !existingPaths.has(f.relativePath));
    if (newFiles.length > 0) {
      taskRepo.bulkCreateFiles(
        task.id,
        newFiles.map((f) => ({ relativePath: f.relativePath, fileSize: f.size }))
      );
    }
    const pendingFiles = taskRepo.listFiles(task.id, "pending");
    const failedFiles = taskRepo.listFiles(task.id, "failed");
    const uploadingFiles = taskRepo.listFiles(task.id, "uploading");
    const toUpload = [...uploadingFiles, ...pendingFiles, ...failedFiles];
    const completedFiles = taskRepo.listFiles(task.id, "completed");
    let uploadedCount = completedFiles.length;
    let uploadedBytes = completedFiles.reduce((sum, f) => sum + f.fileSize, 0);
    taskRepo.updateStatus(task.id, "uploading");
    taskRepo.updateProgress(task.id, uploadedCount, uploadedBytes);
    const processMarker = {
      version: 1,
      taskId: task.id,
      status: "uploading",
      totalFiles: files.length,
      uploadedFiles: uploadedCount,
      files: {},
      lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
      error: null
    };
    for (const f of completedFiles) processMarker.files[f.relativePath] = "completed";
    for (const f of toUpload) processMarker.files[f.relativePath] = "pending";
    const speedCalc = new SpeedCalculator();
    const ossPrefix = ossConfig.prefix || "";
    const folderName = task.folderName;
    const broadcastProgress = (currentFile) => {
      const progress = {
        taskId: task.id,
        uploadedFiles: uploadedCount,
        totalFiles: files.length,
        uploadedBytes,
        totalBytes,
        speed: speedCalc.getSpeed(),
        currentFile
      };
      for (const win of electron.BrowserWindow.getAllWindows()) {
        win.webContents.send(IPC.TASK_PROGRESS, progress);
      }
    };
    let idx = 0;
    const pool = [];
    const uploadNext = async () => {
      while (idx < toUpload.length && !signal?.aborted) {
        const file = toUpload[idx++];
        const ossKey = path.join(ossPrefix, folderName, file.relativePath).replace(/\\/g, "/");
        const localPath = path.join(task.folderPath, file.relativePath);
        let acquired = false;
        try {
          await semaphore.acquire(signal);
          acquired = true;
          taskRepo.updateFileStatus(file.id, "uploading");
          processMarker.files[file.relativePath] = "uploading";
          broadcastProgress(file.relativePath);
          await ossService.uploadFile(localPath, ossKey, file.fileSize, (fraction) => {
            const bytesDone = Math.round(file.fileSize * fraction);
            speedCalc.addSample(bytesDone);
            broadcastProgress(file.relativePath);
          }, signal, taskClient);
          taskRepo.updateFileStatus(file.id, "completed", ossKey);
          processMarker.files[file.relativePath] = "completed";
          uploadedCount++;
          uploadedBytes += file.fileSize;
          taskRepo.updateProgress(task.id, uploadedCount, uploadedBytes);
          processMarker.uploadedFiles = uploadedCount;
          processMarker.lastUpdated = (/* @__PURE__ */ new Date()).toISOString();
          if (uploadedCount % 10 === 0 || uploadedCount === files.length) {
            writeProcessTask(task.folderPath, processMarker);
          }
          broadcastProgress(null);
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") {
            taskRepo.updateFileStatus(file.id, "pending");
            processMarker.files[file.relativePath] = "pending";
            break;
          }
          const errMsg = err instanceof Error ? err.message : String(err);
          taskRepo.updateFileStatus(file.id, "failed", void 0, void 0, errMsg);
          processMarker.files[file.relativePath] = "failed";
          log.error(`上传失败: ${file.relativePath}`, errMsg);
        } finally {
          if (acquired) semaphore.release();
        }
      }
    };
    for (let i = 0; i < maxFilesPerTask; i++) {
      pool.push(uploadNext());
    }
    await Promise.all(pool);
    if (signal?.aborted) {
      processMarker.status = "paused";
      processMarker.lastUpdated = (/* @__PURE__ */ new Date()).toISOString();
      writeProcessTask(task.folderPath, processMarker);
      return;
    }
    const finalFailedFiles = taskRepo.listFiles(task.id, "failed");
    if (finalFailedFiles.length > 0) {
      processMarker.status = "failed";
      processMarker.error = `${finalFailedFiles.length} 个文件上传失败`;
      writeProcessTask(task.folderPath, processMarker);
      throw new Error(`${finalFailedFiles.length} 个文件上传失败`);
    }
    processMarker.status = "completed";
    processMarker.lastUpdated = (/* @__PURE__ */ new Date()).toISOString();
    writeProcessTask(task.folderPath, processMarker);
  }
}
let instance$2 = null;
function getTaskRunnerService() {
  if (!instance$2) instance$2 = new TaskRunnerService();
  return instance$2;
}
class WebhookService {
  async notify(config, payload) {
    if (!config.enabled || !config.url) return;
    const maxRetries = 3;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(config.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...config.headers
          },
          body: JSON.stringify(payload)
        });
        if (response.ok) {
          log.info(`Webhook 通知成功: ${config.url}`);
          return;
        }
        log.warn(`Webhook 响应异常: ${response.status} ${response.statusText}`);
      } catch (err) {
        log.warn(`Webhook 请求失败 (尝试 ${attempt + 1}/${maxRetries + 1}):`, err);
      }
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1e3;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    log.error(`Webhook 通知最终失败: ${config.url}`);
  }
}
let instance$1 = null;
function getWebhookService() {
  if (!instance$1) instance$1 = new WebhookService();
  return instance$1;
}
class CleanupService {
  timer = null;
  start() {
    if (this.timer) return;
    setTimeout(() => this.cleanup(), 3e4);
    this.timer = setInterval(() => this.cleanup(), 36e5);
    log.info("自动清理服务已启动");
  }
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    log.info("自动清理服务已停止");
  }
  cleanup() {
    try {
      const settings = getSettingsRepo();
      const config = settings.get("cleanup");
      if (!config?.enabled) return;
      const retentionDays = config.retentionDays || 7;
      const taskRepo = getTaskRepo();
      const tasks = taskRepo.getCompletedForCleanup(retentionDays);
      if (tasks.length === 0) return;
      log.info(`自动清理: 发现 ${tasks.length} 个可清理任务 (保留天数: ${retentionDays})`);
      let cleaned = 0;
      for (const task of tasks) {
        try {
          if (!fs.existsSync(task.folderPath)) {
            continue;
          }
          fs.rmSync(task.folderPath, { recursive: true, force: true });
          cleaned++;
          log.info(`自动清理: 已删除 ${task.folderPath} (任务ID: ${task.id}, 完成于: ${task.completedAt})`);
        } catch (err) {
          log.error(`自动清理失败: ${task.folderPath}`, err);
        }
      }
      if (cleaned > 0) {
        log.info(`自动清理完成: 共删除 ${cleaned} 个文件夹`);
      }
    } catch (err) {
      log.error("自动清理服务异常:", err);
    }
  }
}
let instance = null;
function getCleanupService() {
  if (!instance) instance = new CleanupService();
  return instance;
}
let logDir = "";
function initLogger(config) {
  logDir = config?.directory || path.join(electron.app.getPath("userData"), "logs");
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  log.transports.file.resolvePathFn = () => {
    const date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const dir = path.join(logDir, date);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, "info.log");
  };
  log.transports.file.level = "info";
  log.transports.file.format = "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}";
  log.transports.file.maxSize = 10 * 1024 * 1024;
  log.hooks.push((message) => {
    if (!logDir) return message;
    const level = message.level;
    if (level === "error" || level === "warn") {
      try {
        const date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
        const dir = path.join(logDir, date);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        const fileName = level === "error" ? "error.log" : "warn.log";
        const text = message.data?.map((d) => String(d)).join(" ") || "";
        const ts = (/* @__PURE__ */ new Date()).toISOString().replace("T", " ").slice(0, 23);
        const line = `[${ts}] [${level}] ${text}
`;
        fs.appendFileSync(path.join(dir, fileName), line);
      } catch {
      }
    }
    return message;
  });
  const maxDays = config?.maxDays || 30;
  cleanOldLogs(logDir, maxDays);
  log.info("日志系统初始化完成, 目录:", logDir);
}
function cleanOldLogs(dir, maxDays) {
  try {
    const cutoff = Date.now() - maxDays * 24 * 60 * 60 * 1e3;
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const entryPath = path.join(dir, entry);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entry)) continue;
      try {
        const stat = fs.statSync(entryPath);
        if (stat.isDirectory() && stat.mtimeMs < cutoff) {
          fs.rmSync(entryPath, { recursive: true, force: true });
          log.info("已清理过期日志目录:", entry);
        }
      } catch {
      }
    }
  } catch {
  }
}
let mainWindow = null;
let annotationWindow = null;
let tray = null;
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: "数据采集上传工具",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });
  mainWindow.on("close", (e) => {
    if (!electron.app.isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
function createTray() {
  const icon = electron.nativeImage.createEmpty();
  tray = new electron.Tray(icon.isEmpty() ? electron.nativeImage.createFromBuffer(Buffer.alloc(0)) : icon);
  const contextMenu = electron.Menu.buildFromTemplate([
    {
      label: "显示主窗口",
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      }
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        electron.app.isQuitting = true;
        electron.app.quit();
      }
    }
  ]);
  tray.setToolTip("数据采集上传工具");
  tray.setContextMenu(contextMenu);
  tray.on("click", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}
function registerHotkey() {
  try {
    const settingsRepo = getSettingsRepo();
    const hotkey = settingsRepo.get("hotkey") || "CommandOrControl+Shift+U";
    electron.globalShortcut.register(hotkey, () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });
  } catch (err) {
    log.error("注册快捷键失败:", err);
  }
}
function startServices() {
  const taskQueue = getTaskQueueService();
  const taskRunner = getTaskRunnerService();
  const webhookService = getWebhookService();
  const taskRepo = getTaskRepo();
  const settingsRepo = getSettingsRepo();
  taskQueue.setTaskRunner(async (task, signal) => {
    await taskRunner.run(task, signal);
    const webhookConfig = settingsRepo.get("webhook");
    if (webhookConfig?.enabled) {
      const updatedTask = taskRepo.getById(task.id);
      if (updatedTask) {
        const createdAt = new Date(updatedTask.createdAt).getTime();
        const now = Date.now();
        const durationSeconds = Math.round((now - createdAt) / 1e3);
        webhookService.notify(webhookConfig, {
          event: "task_completed",
          taskId: updatedTask.id,
          folderName: updatedTask.folderName,
          fileCount: updatedTask.totalFiles,
          totalBytes: updatedTask.totalBytes,
          durationSeconds,
          status: "completed",
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
    }
  });
  taskQueue.on("task:status-change", (event) => {
    if (event.newStatus === "failed") {
      const webhookConfig = settingsRepo.get("webhook");
      if (webhookConfig?.enabled) {
        const task = taskRepo.getById(event.taskId);
        if (task) {
          webhookService.notify(webhookConfig, {
            event: "task_failed",
            taskId: task.id,
            folderName: task.folderName,
            fileCount: task.totalFiles,
            totalBytes: task.totalBytes,
            durationSeconds: 0,
            status: "failed",
            timestamp: (/* @__PURE__ */ new Date()).toISOString()
          });
        }
      }
    }
    for (const win of electron.BrowserWindow.getAllWindows()) {
      win.webContents.send("task:status-change", event);
    }
  });
  const unfinished = taskRepo.getUnfinishedTasks();
  if (unfinished.length > 0) {
    log.info(`发现 ${unfinished.length} 个未完成任务，重新加入队列`);
    for (const task of unfinished) {
      if (task.status === "uploading" || task.status === "scanning") {
        taskRepo.updateStatus(task.id, "pending");
      }
    }
  }
  taskQueue.start();
  const scanner = getScannerService();
  scanner.start();
  getCleanupService().start();
  log.info("所有服务已启动");
}
electron.app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.uploader.app");
  electron.app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });
  initLogger();
  initDatabase();
  const logConfig = getSettingsRepo().get("log");
  if (logConfig?.directory) {
    initLogger(logConfig);
  }
  registerAllIpc();
  createWindow();
  createTray();
  registerHotkey();
  startServices();
  log.info("应用启动完成");
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.app.on("will-quit", () => {
  electron.globalShortcut.unregisterAll();
  getScannerService().stop();
  getTaskQueueService().stop();
  getCleanupService().stop();
});
electron.app.isQuitting = false;
electron.app.on("before-quit", () => {
  electron.app.isQuitting = true;
});
function getMainWindow() {
  return mainWindow;
}
function createAnnotationWindow() {
  if (annotationWindow && !annotationWindow.isDestroyed()) {
    annotationWindow.focus();
    return;
  }
  annotationWindow = new electron.BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: "图像标注",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  annotationWindow.on("closed", () => {
    annotationWindow = null;
  });
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    annotationWindow.loadURL(process.env["ELECTRON_RENDERER_URL"] + "#/annotation");
  } else {
    annotationWindow.loadFile(path.join(__dirname, "../renderer/index.html"), { hash: "annotation" });
  }
}
exports.createAnnotationWindow = createAnnotationWindow;
exports.getMainWindow = getMainWindow;
