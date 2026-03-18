// ============================================
// 共享类型定义 — 主进程 & 渲染进程
// ============================================

// ---- 任务相关 ----
export type TaskStatus = 'pending' | 'scanning' | 'uploading' | 'completed' | 'failed' | 'paused'
export type FileStatus = 'pending' | 'uploading' | 'completed' | 'failed'
export type SourceType = 'local' | 'rsync' | 'manual'
export type SSHAuthType = 'key' | 'password'
export type TransferMode = 'rsync' | 'sftp'

export interface Task {
  id: string
  folderPath: string
  folderName: string
  status: TaskStatus
  totalFiles: number
  uploadedFiles: number
  totalBytes: number
  uploadedBytes: number
  ossPrefix: string
  errorMessage: string | null
  sourceType: SourceType
  sourceMachineId: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface TaskFile {
  id: string
  taskId: string
  relativePath: string
  fileSize: number
  status: FileStatus
  ossKey: string | null
  uploadId: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

export interface TaskProgress {
  taskId: string
  uploadedFiles: number
  totalFiles: number
  uploadedBytes: number
  totalBytes: number
  speed: number // bytes per second
  currentFile: string | null
}

export interface TaskStatusEvent {
  taskId: string
  oldStatus: TaskStatus
  newStatus: TaskStatus
}

// ---- SSH 机器 ----
export interface SSHMachine {
  id: string
  name: string
  host: string
  port: number
  username: string
  authType: SSHAuthType
  privateKeyPath: string | null
  remoteDir: string
  localDir: string
  bwLimit: number
  cpuNice: number
  transferMode: TransferMode
  enabled: boolean
  lastSyncAt: string | null
  createdAt: string
}

export interface SSHMachineInput {
  name: string
  host: string
  port: number
  username: string
  authType: SSHAuthType
  privateKeyPath?: string
  password?: string
  remoteDir: string
  localDir: string
  bwLimit: number
  cpuNice: number
  transferMode: TransferMode
  enabled: boolean
}

export interface RsyncProgress {
  machineId: string
  percent: number
  speed: string
  file: string
}

// ---- 设置 ----
export interface FilterRules {
  whitelist: string[]   // 白名单文件/模式（最高优先级）
  blacklist: string[]   // 黑名单文件/模式
  regex: string[]       // 正则表达式模式
  suffixes: string[]    // 后缀（如 .jpg, .csv）
}

export interface OSSConfig {
  endpoint: string
  bucket: string
  region: string
  prefix: string
  accessKeyId: string
  accessKeySecret: string
}

export interface WebhookConfig {
  url: string
  headers: Record<string, string>
  enabled: boolean
}

export interface ScanConfig {
  directories: string[]
  intervalSeconds: number
}

export interface UploadConfig {
  maxConcurrentTasks: number
  maxFilesPerTask: number
  maxConcurrentUploads: number // 全局并发上传文件数上限（跨任务）
  multipartThreshold: number // bytes, default 100MB
  startAfterTime: string // 每日最早开始上传时间，格式 HH:mm
  endBeforeTime: string // 每日最晚结束上传时间，格式 HH:mm
}

export interface StabilityConfig {
  checkIntervalMs: number
  checkCount: number
}

export interface LogConfig {
  directory: string    // 日志目录，默认 userData/logs
  maxDays: number      // 日志保留天数
}

export interface DataCollectConfig {
  enabled: boolean
}

export interface CleanupConfig {
  enabled: boolean
  retentionDays: number
}

export interface AppSettings {
  scan: ScanConfig
  upload: UploadConfig
  oss: OSSConfig
  filter: FilterRules
  webhook: WebhookConfig
  hotkey: string
  stability: StabilityConfig
  log: LogConfig
  dataCollect: DataCollectConfig
  cleanup: CleanupConfig
}

// ---- 扫描器 ----
export interface ScannerStatus {
  running: boolean
  lastScanAt: string | null
  nextScanAt: string | null
  watchedDirectories: string[]
  pendingStabilityChecks: Array<{
    path: string
    checks: number
    requiredChecks: number
    discoveredAt: string
  }>
  lastScanResults: {
    scannedDirs: number
    newDirsFound: number
    existingDirs: number
    timestamp: string
  } | null
}

// ---- 数采模式 ----
export interface DataCollectInfo {
  folderPath: string
  folderName: string
  date: string | null
  sessionTime: string | null
  weldSignal: {
    arcStartUs: number | null
    arcEndUs: number | null
    arcStartTime: string | null
    arcEndTime: string | null
    durationSeconds: number | null
  }
  cameras: Array<{
    name: string
    imageCount: number
    tsMinUs: number | null
    tsMaxUs: number | null
    tsMinTime: string | null
    tsMaxTime: string | null
  }>
  robotState: { jointStateRows: number; toolPoseRows: number; hasCalibration: boolean }
  controlCmd: { speedRows: number; freqRows: number }
  pointCloudCount: number
  depthImageCount: number
  annotation: {
    hasXml: boolean
    dataType: string | null
    qualityType: string | null
    specMin: number | null
    specMax: number | null
  }
  totalFileCount: number
  totalSizeBytes: number
  collectedAt: string
}

export interface SftpProgress {
  machineId: string
  totalFiles: number
  uploadedFiles: number
  currentFile: string
  speed: string
}

// ---- 历史记录 ----
export interface HistoryItem {
  id: string
  folderName: string
  fileCount: number
  totalBytes: number
  durationSeconds: number
  status: 'completed' | 'failed'
  completedAt: string
}

export interface HistoryQuery {
  page: number
  pageSize: number
  status?: 'completed' | 'failed'
}

export interface HistoryResult {
  items: HistoryItem[]
  total: number
}

// ---- 标记文件 ----
export interface TmpUploadMarker {
  version: number
  createdAt: string
  folderPath: string
  metadata: {
    source: SourceType
    machineId?: string
  }
}

export interface ProcessTaskMarker {
  version: number
  taskId: string
  status: TaskStatus
  totalFiles: number
  uploadedFiles: number
  files: Record<string, FileStatus>
  lastUpdated: string
  error: string | null
}

// ---- 磁盘用量 ----
export interface DiskUsageInfo {
  path: string
  totalBytes: number
  freeBytes: number
  usedBytes: number
  usagePercent: number
}
