import { readdirSync, statSync } from 'fs'
import { readdir, stat } from 'fs/promises'
import { join, extname, basename } from 'path'
import type { FilterRules } from '@shared/types'

interface PatternMatcher {
  exactName?: string
  suffix?: string
  wildcard?: RegExp
}

/**
 * 文件过滤规则引擎
 * 优先级：白名单 > 黑名单 > 正则排除 > 后缀匹配
 */
export class FileFilterService {
  private rules: FilterRules
  private whitelist: PatternMatcher[] = []
  private blacklist: PatternMatcher[] = []
  private regexExcludes: RegExp[] = []
  private suffixes = new Set<string>()

  constructor(rules: FilterRules) {
    this.rules = rules
    this.compileRules()
  }

  updateRules(rules: FilterRules): void {
    this.rules = rules
    this.compileRules()
  }

  /**
   * 判断单个文件是否应该被包含
   * @param relativePath 文件相对路径
   * @returns true = 包含, false = 排除
   */
  shouldInclude(relativePath: string): boolean {
    const fileName = basename(relativePath)
    const ext = extname(relativePath).toLowerCase()

    // 1. 白名单（最高优先级）：匹配则直接包含
    if (this.whitelist.length > 0) {
      for (const matcher of this.whitelist) {
        if (this.matchPattern(fileName, relativePath, ext, matcher)) {
          return true
        }
      }
    }

    // 2. 黑名单：匹配则排除
    if (this.blacklist.length > 0) {
      for (const matcher of this.blacklist) {
        if (this.matchPattern(fileName, relativePath, ext, matcher)) {
          return false
        }
      }
    }

    // 3. 正则排除：匹配则排除
    if (this.regexExcludes.length > 0) {
      for (const re of this.regexExcludes) {
        if (re.test(relativePath) || re.test(fileName)) {
          return false
        }
      }
    }

    // 4. 后缀匹配：如果配置了后缀列表，只包含匹配的
    if (this.suffixes.size > 0) {
      return this.suffixes.has(ext)
    }

    // 未配置任何后缀规则时默认包含
    return true
  }

  /**
   * 递归扫描文件夹，返回过滤后的文件列表
   */
  scanFolder(
    folderPath: string
  ): Array<{
    relativePath: string
    absolutePath: string
    size: number
    mtimeMs: number
  }> {
    const results: Array<{
      relativePath: string
      absolutePath: string
      size: number
      mtimeMs: number
    }> = []
    this.walkDir(folderPath, folderPath, results)
    return results
  }

  async scanFolderAsync(
    folderPath: string
  ): Promise<
    Array<{
      relativePath: string
      absolutePath: string
      size: number
      mtimeMs: number
    }>
  > {
    const results: Array<{
      relativePath: string
      absolutePath: string
      size: number
      mtimeMs: number
    }> = []
    await this.walkDirAsync(folderPath, folderPath, results)
    return results
  }

  private walkDir(
    basePath: string,
    currentPath: string,
    results: Array<{
      relativePath: string
      absolutePath: string
      size: number
      mtimeMs: number
    }>
  ): void {
    const entries = readdirSync(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(currentPath, entry.name)
      if (entry.isDirectory()) {
        // 跳过隐藏目录
        if (entry.name.startsWith('.')) continue
        this.walkDir(basePath, fullPath, results)
      } else if (entry.isFile()) {
        const relativePath = fullPath.slice(basePath.length + 1)
        // 跳过标记文件
        if (
          entry.name === 'tmp_upload.json' ||
          entry.name === 'process_task.json' ||
          entry.name === 'day_upload.json'
        ) continue
        if (this.shouldInclude(relativePath)) {
          const stat = statSync(fullPath)
          results.push({
            relativePath,
            absolutePath: fullPath,
            size: stat.size,
            mtimeMs: stat.mtimeMs
          })
        }
      }
    }
  }

  private async walkDirAsync(
    basePath: string,
    currentPath: string,
    results: Array<{
      relativePath: string
      absolutePath: string
      size: number
      mtimeMs: number
    }>
  ): Promise<void> {
    const entries = await readdir(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(currentPath, entry.name)
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.')) continue
        await this.walkDirAsync(basePath, fullPath, results)
      } else if (entry.isFile()) {
        const relativePath = fullPath.slice(basePath.length + 1)
        if (
          entry.name === 'tmp_upload.json' ||
          entry.name === 'process_task.json' ||
          entry.name === 'day_upload.json'
        ) continue
        if (!this.shouldInclude(relativePath)) continue

        try {
          const fileStat = await stat(fullPath)
          results.push({
            relativePath,
            absolutePath: fullPath,
            size: fileStat.size,
            mtimeMs: fileStat.mtimeMs
          })
        } catch {
          // 文件可能在异步扫描期间被删除。
        }
      }
    }
  }

  private compileRules(): void {
    this.whitelist = this.rules.whitelist
      .map((pattern) => this.compilePattern(pattern))
      .filter((matcher): matcher is PatternMatcher => Boolean(matcher))
    this.blacklist = this.rules.blacklist
      .map((pattern) => this.compilePattern(pattern))
      .filter((matcher): matcher is PatternMatcher => Boolean(matcher))
    this.regexExcludes = []
    for (const pattern of this.rules.regex) {
      try {
        this.regexExcludes.push(new RegExp(pattern))
      } catch {
        // 无效正则，跳过
      }
    }
    this.suffixes = new Set(
      this.rules.suffixes
        .map((suffix) => this.normalizeSuffix(suffix))
        .filter(Boolean)
    )
  }

  private compilePattern(pattern: string): PatternMatcher | null {
    if (!pattern) return null
    if (pattern.includes('*')) {
      const regexStr = '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$'
      try {
        return { wildcard: new RegExp(regexStr, 'i') }
      } catch {
        return null
      }
    }
    if (pattern.startsWith('.')) {
      return { suffix: this.normalizeSuffix(pattern) }
    }
    return { exactName: pattern }
  }

  private matchPattern(
    fileName: string,
    relativePath: string,
    ext: string,
    matcher: PatternMatcher
  ): boolean {
    // 完全匹配文件名
    if (matcher.exactName && fileName === matcher.exactName) return true
    // 后缀匹配（如 .jpg）
    if (matcher.suffix && ext === matcher.suffix) return true
    // 通配符简单匹配（如 *.log, data_*.csv）
    if (matcher.wildcard) {
      return matcher.wildcard.test(fileName) || matcher.wildcard.test(relativePath)
    }
    return false
  }

  private normalizeSuffix(suffix: string): string {
    const trimmed = suffix.trim().toLowerCase()
    if (!trimmed) return ''
    return trimmed.startsWith('.') ? trimmed : `.${trimmed}`
  }
}
