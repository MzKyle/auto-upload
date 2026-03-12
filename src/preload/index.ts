import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

export type IpcCallback = (event: IpcRendererEvent, ...args: unknown[]) => void

const api = {
  invoke: (channel: string, ...args: unknown[]): Promise<unknown> => {
    return ipcRenderer.invoke(channel, ...args)
  },
  on: (channel: string, callback: IpcCallback): (() => void) => {
    ipcRenderer.on(channel, callback)
    return () => {
      ipcRenderer.removeListener(channel, callback)
    }
  },
  off: (channel: string, callback: IpcCallback): void => {
    ipcRenderer.removeListener(channel, callback)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
