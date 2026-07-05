import { BUILTIN_UPLOAD_PIPELINES, UPLOAD_PIPELINE_IDS } from '@shared/plugins'
import {
  normalizeProfileUploadPipeline
} from '@shared/upload-profile'
import type {
  Task,
  UploadPipelineManifest,
  UploadPipelineResult
} from '@shared/types'
import { getPluginRunRepo } from '../db/plugin-run.repo'
import { getSettingsRepo } from '../db/settings.repo'
import { FileFilterService } from './file-filter.service'
import { getModule1PreUploadService } from './module1-preupload.service'

export class UploadPipelineRuntimeService {
  listManifests(): UploadPipelineManifest[] {
    return BUILTIN_UPLOAD_PIPELINES
  }

  async prepareUploadPlan(
    task: Task,
    sourceStableChecks: number
  ): Promise<UploadPipelineResult> {
    const pipeline = normalizeProfileUploadPipeline(
      task.profileSnapshot?.uploadPipeline,
      task.profileSnapshot?.plugins
    )
    const run = getPluginRunRepo().start(task.id, pipeline.id, 'pipeline')

    try {
      const result =
        pipeline.id === UPLOAD_PIPELINE_IDS.SANY_MODULE1_UPLOAD
          ? await getModule1PreUploadService().run(task, pipeline.config)
          : await this.prepareStandardUploadPlan(task, sourceStableChecks)

      getPluginRunRepo().complete(run.id, {
        summary: result.summary || null,
        stagingPath:
          result.pipelineId === UPLOAD_PIPELINE_IDS.SANY_MODULE1_UPLOAD
            ? result.uploadRootPath
            : null,
        artifacts: result.artifacts || null
      })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      getPluginRunRepo().fail(run.id, message)
      throw error
    }
  }

  private async prepareStandardUploadPlan(
    task: Task,
    requiredStableChecks: number
  ): Promise<UploadPipelineResult> {
    const settings = getSettingsRepo().getAll()
    const files = await new FileFilterService(
      task.profileSnapshot?.filter || settings.filter
    ).scanFolderAsync(task.folderPath)
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0)

    return {
      pipelineId: UPLOAD_PIPELINE_IDS.STANDARD_UPLOAD,
      uploadRootPath: task.folderPath,
      requiredStableChecks,
      files: files.map((file) => ({
        relativePath: file.relativePath,
        fileSize: file.size,
        mtimeMs: file.mtimeMs
      })),
      summary: {
        files: files.length,
        totalBytes
      }
    }
  }
}

let instance: UploadPipelineRuntimeService | null = null
export function getUploadPipelineRuntimeService(): UploadPipelineRuntimeService {
  if (!instance) instance = new UploadPipelineRuntimeService()
  return instance
}
