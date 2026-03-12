import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { MARKER_FILES } from '@shared/constants'
import type { TmpUploadMarker, ProcessTaskMarker } from '@shared/types'

export function readTmpUpload(folderPath: string): TmpUploadMarker | null {
  const filePath = join(folderPath, MARKER_FILES.TMP_UPLOAD)
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

export function writeTmpUpload(folderPath: string, marker: TmpUploadMarker): void {
  const filePath = join(folderPath, MARKER_FILES.TMP_UPLOAD)
  writeFileSync(filePath, JSON.stringify(marker, null, 2), 'utf-8')
}

export function readProcessTask(folderPath: string): ProcessTaskMarker | null {
  const filePath = join(folderPath, MARKER_FILES.PROCESS_TASK)
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

export function writeProcessTask(folderPath: string, marker: ProcessTaskMarker): void {
  const filePath = join(folderPath, MARKER_FILES.PROCESS_TASK)
  writeFileSync(filePath, JSON.stringify(marker, null, 2), 'utf-8')
}
