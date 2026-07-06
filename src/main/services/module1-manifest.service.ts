import { readdir, stat } from 'fs/promises'
import { join, relative } from 'path'

export interface Module1FileInfo {
  fullPath: string
  folderName: string
  type1: 'vla' | 'teleop' | 'RL' | 'unknown'
  type2: string
  date: string | null
}

export interface Module1ManifestItem {
  localRelativePath: string
  ossKey: string
  fileSize: number
  mtimeMs: number
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/')
}

async function walkFiles(dirPath: string): Promise<Array<{ filePath: string; size: number; mtimeMs: number }>> {
  const entries = await readdir(dirPath, { withFileTypes: true })
  const result: Array<{ filePath: string; size: number; mtimeMs: number }> = []

  for (const entry of entries) {
    const abs = join(dirPath, entry.name)
    if (entry.isDirectory()) {
      result.push(...(await walkFiles(abs)))
      continue
    }
    if (!entry.isFile()) continue
    const fileStat = await stat(abs)
    result.push({
      filePath: abs,
      size: fileStat.size,
      mtimeMs: fileStat.mtimeMs
    })
  }

  return result
}

export class Module1ManifestService {
  async build(
    rootPath: string,
    infos: Module1FileInfo[],
    stationPrefix = 'station2'
  ): Promise<Module1ManifestItem[]> {
    const manifest: Module1ManifestItem[] = []

    for (const info of infos) {
      const files = await walkFiles(info.fullPath)
      for (const file of files) {
        const relInFolder = normalizePath(relative(info.fullPath, file.filePath))
        const localRelativePath = normalizePath(relative(rootPath, file.filePath))
        const ossKey = normalizePath(
          [stationPrefix, info.type1, info.type2, info.date, info.folderName, relInFolder]
            .filter(Boolean)
            .join('/')
        ).replace(/\/+/g, '/')

        manifest.push({
          localRelativePath,
          ossKey,
          fileSize: file.size,
          mtimeMs: file.mtimeMs
        })
      }
    }

    return manifest
  }
}

let instance: Module1ManifestService | null = null

export function getModule1ManifestService(): Module1ManifestService {
  if (!instance) instance = new Module1ManifestService()
  return instance
}
