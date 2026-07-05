import {
  ExtensionRuntimeService,
  getExtensionRuntimeService
} from './extension-runtime.service'

export class PluginRuntimeService extends ExtensionRuntimeService {}

export function getPluginRuntimeService(): PluginRuntimeService {
  return getExtensionRuntimeService() as PluginRuntimeService
}
