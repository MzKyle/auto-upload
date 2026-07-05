import { existsSync } from 'fs'
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'fs/promises'
import { app } from 'electron'
import { basename, join } from 'path'
import { tmpdir } from 'os'
import log from 'electron-log'
import { PLUGIN_IDS } from '@shared/plugins'
import type { PreUploadResult, Task } from '@shared/types'
import {
  getModule1ManifestService,
  type Module1FileInfo,
  type Module1ManifestItem
} from './module1-manifest.service'

interface Module1ManifestFile {
  version: number
  createdAt: string
  sourceRootPath: string
  stagingRootPath: string
  manifest: Module1ManifestItem[]
}

interface Module1PluginConfig {
  stationPrefix?: string
}

const MANIFEST_FILE = '.module1-manifest.json'

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function getFileDate(filePath: string): Promise<string | null> {
  try {
    const fileStat = await stat(filePath)
    return formatDate(fileStat.mtime)
  } catch {
    return null
  }
}

function extractTagValues(xml: string, tagName: string): string[] {
  const re = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'gi')
  const values: string[] = []
  let match: RegExpExecArray | null
  while ((match = re.exec(xml)) !== null) {
    values.push(String(match[1]).trim())
  }
  return values
}

function normalizeStationPrefix(value: unknown): string {
  if (typeof value !== 'string') return 'station2'
  const normalized = value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim()
  return normalized || 'station2'
}

function getPluginWorkspaceRoot(): string {
  const electronApp = app as unknown as { getPath?: (name: string) => string } | undefined
  return electronApp?.getPath?.('userData') || join(tmpdir(), 'ts-upload-plugin-workspaces')
}

export class Module1PreUploadService {
  async run(task: Task, rawConfig: unknown): Promise<PreUploadResult> {
    if (!existsSync(task.folderPath)) {
      throw new Error('源目录不存在，无法执行 Module1 上传前处理')
    }

    const config = (typeof rawConfig === 'object' && rawConfig !== null
      ? rawConfig
      : {}) as Module1PluginConfig
    const stationPrefix = normalizeStationPrefix(config.stationPrefix)
    const stagingRootPath = join(
      getPluginWorkspaceRoot(),
      'plugin-workspaces',
      task.id,
      'module1'
    )

    await rm(stagingRootPath, { recursive: true, force: true })
    await mkdir(stagingRootPath, { recursive: true })
    await cp(task.folderPath, stagingRootPath, {
      recursive: true,
      force: true,
      errorOnExist: false
    })

    await this.processDataFolders(stagingRootPath)
    const fileInfos = await this.splitType(stagingRootPath)
    const manifest = await getModule1ManifestService().build(
      stagingRootPath,
      fileInfos,
      stationPrefix
    )
    if (manifest.length === 0) {
      throw new Error('Module1 筛选结果为空：未找到包含 annotation/segment_timestamps.xml 的有效数据目录')
    }

    const payload: Module1ManifestFile = {
      version: 1,
      createdAt: new Date().toISOString(),
      sourceRootPath: task.folderPath,
      stagingRootPath,
      manifest
    }
    await writeFile(
      join(stagingRootPath, MANIFEST_FILE),
      JSON.stringify(payload, null, 2),
      'utf-8'
    )

    const totalBytes = manifest.reduce((sum, item) => sum + item.fileSize, 0)
    return {
      pluginId: PLUGIN_IDS.MODULE1_PREUPLOAD,
      uploadRootPath: stagingRootPath,
      files: manifest.map((item) => ({
        relativePath: item.localRelativePath,
        fileSize: item.fileSize,
        mtimeMs: item.mtimeMs,
        plannedObjectKey: item.ossKey
      })),
      summary: {
        sourceRootPath: task.folderPath,
        stagingRootPath,
        files: manifest.length,
        totalBytes,
        stationPrefix
      },
      artifacts: {
        manifestPath: join(stagingRootPath, MANIFEST_FILE)
      }
    }
  }

  private async processDataFolders(rootPath: string): Promise<void> {
    const entries = await readdir(rootPath, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const folderPath = join(rootPath, entry.name)
      const weldSignalPath = join(folderPath, 'welding_state', 'weld_signal.csv')
      if (!existsSync(weldSignalPath)) continue

      const { startTime, endTime } = await this.readWeldSignal(weldSignalPath)
      if (startTime === null || endTime === null) continue

      const startRange = startTime - 5_000_000
      const endRange = endTime + 5_000_000

      const subNames = await readdir(folderPath)
      for (const subName of subNames) {
        if (!subName.includes('camera_0')) continue
        const cameraPath = join(folderPath, subName)
        if (!existsSync(cameraPath)) continue
        await this.cleanImages(cameraPath, startRange, endRange)
      }
    }
  }

  private async readWeldSignal(filePath: string): Promise<{ startTime: number | null; endTime: number | null }> {
    let startTime: number | null = null
    let endTime: number | null = null
    const strictPattern = /^\s*(\d+)\s+[^:]*:\s*(true|false)\s*$/i

    try {
      const text = await readFile(filePath, 'utf-8')
      const lines = text.split(/\r?\n/)
      for (const raw of lines) {
        const line = raw.trim()
        if (!line) continue

        let ts: number | null = null
        let isTrue: boolean | null = null

        const strict = strictPattern.exec(line)
        if (strict) {
          ts = Number(strict[1])
          isTrue = strict[2].toLowerCase() === 'true'
        } else {
          const tsMatch = line.match(/(\d+)/)
          const boolMatch = line.match(/(true|false)/i)
          if (!tsMatch || !boolMatch) continue
          ts = Number(tsMatch[1])
          isTrue = boolMatch[1].toLowerCase() === 'true'
        }

        if (!Number.isFinite(ts) || isTrue === null) continue
        if (isTrue && startTime === null) startTime = ts
        if (!isTrue) endTime = ts
      }
    } catch {
      return { startTime: null, endTime: null }
    }

    return { startTime, endTime }
  }

  private async cleanImages(folderPath: string, startRange: number, endRange: number): Promise<void> {
    let deletedCount = 0
    const filenames = await readdir(folderPath)
    for (const filename of filenames) {
      if (!filename.toLowerCase().endsWith('.jpg')) continue

      const abs = join(folderPath, filename)
      try {
        const stem = filename.slice(0, -4)
        const ts = Number(stem)
        if (!Number.isFinite(ts)) {
          log.warn(`文件名 ${filename} 不包含有效时间戳，已跳过`)
          continue
        }
        if (ts >= startRange && ts <= endRange) continue

        await rm(abs, { force: true })
        deletedCount++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log.warn(`删除文件 ${filename} 时出错: ${msg}`)
      }
    }

    log.info(`Module1 staging 在 ${basename(folderPath)} 中删除了 ${deletedCount} 个文件`)
  }

  private async splitType(rootPath: string): Promise<Module1FileInfo[]> {
    const originalDirs = (await readdir(rootPath, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)

    await this.createProjectStructure(rootPath)

    const infos: Module1FileInfo[] = []
    for (const dirName of originalDirs) {
      const fullPath = join(rootPath, dirName)
      const xmlPath = join(fullPath, 'annotation', 'segment_timestamps.xml')
      if (!existsSync(xmlPath)) continue

      let type1: Module1FileInfo['type1'] = 'unknown'
      let type2 = ''
      let failed = false
      let specMin = 0
      let specMax = 0
      let dataType = ''
      let qualityType = ''

      try {
        const xml = await readFile(xmlPath, 'utf-8')
        const minValues = extractTagValues(xml, 'data_spec_min')
        const maxValues = extractTagValues(xml, 'data_spec_max')
        const dataTypeValues = extractTagValues(xml, 'data_type')
        const qualityValues = extractTagValues(xml, 'quality_type')

        if (minValues.length !== 1 || maxValues.length !== 1 || dataTypeValues.length !== 1 || qualityValues.length !== 1) {
          failed = true
        } else {
          specMin = Number(minValues[0])
          specMax = Number(maxValues[0])
          dataType = dataTypeValues[0]
          qualityType = qualityValues[0]
          if (!Number.isFinite(specMin) || !Number.isFinite(specMax)) failed = true
        }
      } catch {
        failed = true
      }

      if (!failed) {
        if (qualityType === 'bad') type1 = 'RL'
        else if (dataType.includes('teleop')) type1 = 'teleop'
        else type1 = 'vla'

        type2 = specMin === specMax ? `${specMin}mm` : `${specMin}-${specMax}mm`
      }

      const stateTypePath = join(fullPath, 'state_type')
      const date = await getFileDate(stateTypePath)

      infos.push({
        fullPath,
        folderName: basename(fullPath),
        type1,
        type2,
        date
      })
    }

    log.info('Module1 split 完成, fileInfo 数量:', infos.length)
    return infos
  }

  private async createProjectStructure(rootPath: string): Promise<void> {
    const structure: Record<string, string[]> = {
      vla: ['1mm', '1-2mm', '2mm', '3mm'],
      teleop: ['1mm', '1-2mm', '2mm', '3mm'],
      RL: ['1mm', '1-2mm', '2mm', '3mm'],
      unknown: []
    }

    for (const [top, subs] of Object.entries(structure)) {
      const topDir = join(rootPath, top)
      await mkdir(topDir, { recursive: true })
      for (const sub of subs) {
        await mkdir(join(topDir, sub), { recursive: true })
      }
    }
  }
}

let instance: Module1PreUploadService | null = null

export function getModule1PreUploadService(): Module1PreUploadService {
  if (!instance) instance = new Module1PreUploadService()
  return instance
}
