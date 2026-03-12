import { readdirSync, statSync, existsSync } from 'fs'
import { join, basename } from 'path'
import { BrowserWindow } from 'electron'
import log from 'electron-log'
import { IPC } from '@shared/ipc-channels'
import { getTaskRepo } from '../db/task.repo'
import { getSettingsRepo } from '../db/settings.repo'
import { getDataCollectService } from './data-collect.service'
import { readTmpUpload, writeTmpUpload } from '../utils/marker-file'
import type { TmpUploadMarker, ScanConfig, StabilityConfig, ScannerStatus, DataCollectConfig } from '@shared/types'

interface PendingDir {
  path: string
  checks: number
  discoveredAt: string
  lastSnapshot: Map<string, { size: number; mtimeMs: number }>
}

/**
 * 目录扫描服务
 * - 定时扫描配置的目录列表
 * - 发现新子目录后进行稳定性检查
 * - 确认文件写入完成后创建 tmp_upload.json 并注册任务
 * - 广播扫描状态和结果到渲染进程
 */
export class ScannerService {
  private timer: ReturnType<typeof setInterval> | null = null
  private stabilityTimer: ReturnType<typeof setInterval> | null = null
  private running = false
  private lastScanAt: string | null = null
  private nextScanAt: string | null = null
  private pendingDirs: Map<string, PendingDir> = new Map()
  private lastScanResults: ScannerStatus['lastScanResults'] = null

  start(): void {
    if (this.running) return
    this.running = true

    const settings = getSettingsRepo()
    const scanConfig = settings.get<ScanConfig>('scan')
    const intervalMs = (scanConfig?.intervalSeconds || 30) * 1000

    // 启动时立刻扫描一次
    this.scan()

    this.timer = setInterval(() => this.scan(), intervalMs)

    // 稳定性检查定时器（独立于扫描周期）
    const stabilityConfig = settings.get<StabilityConfig>('stability')
    const checkInterval = stabilityConfig?.checkIntervalMs || 5000
    this.stabilityTimer = setInterval(() => this.checkStability(), checkInterval)

    log.info('扫描器已启动, 间隔:', intervalMs / 1000, '秒')
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.stabilityTimer) {
      clearInterval(this.stabilityTimer)
      this.stabilityTimer = null
    }
    this.running = false
    this.nextScanAt = null
    log.info('扫描器已停止')
    this.broadcastStatus()
  }

  isRunning(): boolean {
    return this.running
  }

  getStatus(): ScannerStatus {
    const settings = getSettingsRepo()
    const scanConfig = settings.get<ScanConfig>('scan')
    const stabilityConfig = settings.get<StabilityConfig>('stability')
    const requiredChecks = stabilityConfig?.checkCount || 3

    const pendingStabilityChecks: ScannerStatus['pendingStabilityChecks'] = []
    for (const [, pending] of this.pendingDirs) {
      pendingStabilityChecks.push({
        path: pending.path,
        checks: pending.checks,
        requiredChecks,
        discoveredAt: pending.discoveredAt
      })
    }

    return {
      running: this.running,
      lastScanAt: this.lastScanAt,
      nextScanAt: this.nextScanAt,
      watchedDirectories: scanConfig?.directories || [],
      pendingStabilityChecks,
      lastScanResults: this.lastScanResults
    }
  }

  /** 手动触发一次扫描 */
  triggerScan(): void {
    this.scan()
  }

  private scan(): void {
    const settings = getSettingsRepo()
    const scanConfig = settings.get<ScanConfig>('scan')
    const directories = scanConfig?.directories || []
    const intervalMs = (scanConfig?.intervalSeconds || 30) * 1000

    let scannedDirs = 0
    let newDirsFound = 0
    let existingDirs = 0

    for (const dir of directories) {
      if (!existsSync(dir)) {
        log.warn('扫描目录不存在:', dir)
        continue
      }
      const result = this.scanDirectory(dir)
      scannedDirs += result.scanned
      newDirsFound += result.newFound
      existingDirs += result.existing
    }

    this.lastScanAt = new Date().toISOString()
    this.nextScanAt = new Date(Date.now() + intervalMs).toISOString()

    this.lastScanResults = {
      scannedDirs,
      newDirsFound,
      existingDirs,
      timestamp: this.lastScanAt
    }

    this.broadcastStatus()
  }

  private scanDirectory(parentDir: string): { scanned: number; newFound: number; existing: number } {
    let scanned = 0
    let newFound = 0
    let existing = 0

    try {
      const entries = readdirSync(parentDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        if (entry.name.startsWith('.')) continue
        scanned++

        const subDirPath = join(parentDir, entry.name)

        // 已有标记文件 → 检查是否已注册任务
        const existingMarker = readTmpUpload(subDirPath)
        if (existingMarker) {
          this.ensureTaskRegistered(subDirPath, entry.name)
          existing++
          continue
        }

        // 新发现的目录 → 加入稳定性检查队列
        if (!this.pendingDirs.has(subDirPath)) {
          log.info('发现新目录, 加入稳定性检查:', subDirPath)
          this.pendingDirs.set(subDirPath, {
            path: subDirPath,
            checks: 0,
            discoveredAt: new Date().toISOString(),
            lastSnapshot: this.snapshotDir(subDirPath)
          })
          newFound++
        }
      }
    } catch (err) {
      log.error('扫描目录失败:', parentDir, err)
    }

    return { scanned, newFound, existing }
  }

  private checkStability(): void {
    if (this.pendingDirs.size === 0) return

    const settings = getSettingsRepo()
    const stabilityConfig = settings.get<StabilityConfig>('stability')
    const requiredChecks = stabilityConfig?.checkCount || 3
    let changed = false

    for (const [dirPath, pending] of this.pendingDirs) {
      const currentSnapshot = this.snapshotDir(dirPath)
      const isStable = this.compareSnapshots(pending.lastSnapshot, currentSnapshot)

      if (isStable) {
        pending.checks++
        log.info(`目录稳定性检查 ${pending.checks}/${requiredChecks}:`, dirPath)

        if (pending.checks >= requiredChecks) {
          this.registerNewDir(dirPath)
          this.pendingDirs.delete(dirPath)
        }
        changed = true
      } else {
        pending.checks = 0
        pending.lastSnapshot = currentSnapshot
        changed = true
      }
    }

    if (changed) {
      this.broadcastStatus()
    }
  }

  private registerNewDir(dirPath: string): void {
    const folderName = basename(dirPath)

    const marker: TmpUploadMarker = {
      version: 1,
      createdAt: new Date().toISOString(),
      folderPath: dirPath,
      metadata: { source: 'local' }
    }

    writeTmpUpload(dirPath, marker)
    this.ensureTaskRegistered(dirPath, folderName)
    log.info('新目录已注册为上传任务:', dirPath)

    // 如果数采模式启用，自动采集元信息
    const settings = getSettingsRepo()
    const dataCollectConfig = settings.get<DataCollectConfig>('dataCollect')
    if (dataCollectConfig?.enabled) {
      try {
        const dcService = getDataCollectService()
        const info = dcService.collectDataInfo(dirPath)
        if (info) {
          // 推送数采结果到渲染进程
          for (const win of BrowserWindow.getAllWindows()) {
            win.webContents.send(IPC.DATA_COLLECT_RESULT, info)
          }
        }
      } catch (err) {
        log.warn('数采分析失败:', dirPath, err)
      }
    }
  }

  private ensureTaskRegistered(dirPath: string, folderName: string): void {
    const taskRepo = getTaskRepo()
    const existing = taskRepo.getByFolderPath(dirPath)
    if (!existing || existing.status === 'completed' || existing.status === 'failed') {
      const settings = getSettingsRepo()
      const ossPrefix = settings.get<string>('oss')
        ? (settings.get<{ prefix: string }>('oss')?.prefix || '')
        : ''

      if (existing && (existing.status === 'completed' || existing.status === 'failed')) {
        return
      }
      if (!existing) {
        taskRepo.create({
          folderPath: dirPath,
          folderName,
          ossPrefix
        })
      }
    }
  }

  private broadcastStatus(): void {
    const status = this.getStatus()
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.SCANNER_EVENT, status)
    }
  }

  /** 快照目录中所有文件的 size 和 mtime */
  private snapshotDir(dirPath: string): Map<string, { size: number; mtimeMs: number }> {
    const snapshot = new Map<string, { size: number; mtimeMs: number }>()
    this.walkForSnapshot(dirPath, dirPath, snapshot)
    return snapshot
  }

  private walkForSnapshot(
    basePath: string,
    currentPath: string,
    snapshot: Map<string, { size: number; mtimeMs: number }>
  ): void {
    try {
      const entries = readdirSync(currentPath, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = join(currentPath, entry.name)
        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.')) {
            this.walkForSnapshot(basePath, fullPath, snapshot)
          }
        } else if (entry.isFile()) {
          try {
            const stat = statSync(fullPath)
            const relPath = fullPath.slice(basePath.length + 1)
            snapshot.set(relPath, { size: stat.size, mtimeMs: stat.mtimeMs })
          } catch {
            // 文件可能被删除
          }
        }
      }
    } catch {
      // 目录不可读
    }
  }

  private compareSnapshots(
    prev: Map<string, { size: number; mtimeMs: number }>,
    curr: Map<string, { size: number; mtimeMs: number }>
  ): boolean {
    if (prev.size !== curr.size) return false
    for (const [key, prevVal] of prev) {
      const currVal = curr.get(key)
      if (!currVal) return false
      if (prevVal.size !== currVal.size || prevVal.mtimeMs !== currVal.mtimeMs) {
        return false
      }
    }
    return true
  }
}

let instance: ScannerService | null = null
export function getScannerService(): ScannerService {
  if (!instance) instance = new ScannerService()
  return instance
}
