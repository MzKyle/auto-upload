import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileFilterService } from '../src/main/services/file-filter.service'
import type { FilterRules } from '../src/shared/types'

const ALL_FILES: FilterRules = {
  whitelist: [],
  blacklist: [],
  regex: [],
  suffixes: []
}

test('async folder scan matches sync filtering and skips marker files', async () => {
  const root = mkdtempSync(join(tmpdir(), 'file-filter-'))
  try {
    mkdirSync(join(root, 'camera'), { recursive: true })
    mkdirSync(join(root, '.hidden'), { recursive: true })
    writeFileSync(join(root, 'camera', '1.jpg'), 'image')
    writeFileSync(join(root, 'camera', '2.csv'), 'csv')
    writeFileSync(join(root, 'tmp_upload.json'), '{}')
    writeFileSync(join(root, '.hidden', 'secret.jpg'), 'secret')

    const service = new FileFilterService({
      ...ALL_FILES,
      suffixes: ['.jpg']
    })
    const syncFiles = service
      .scanFolder(root)
      .map((file) => file.relativePath)
      .sort()
    const asyncFiles = (await service.scanFolderAsync(root))
      .map((file) => file.relativePath)
      .sort()

    assert.deepEqual(syncFiles, ['camera/1.jpg'])
    assert.deepEqual(asyncFiles, syncFiles)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
