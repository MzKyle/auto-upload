"use strict";
const electron = require("electron");
const api = {
  invoke: (channel, ...args) => {
    return electron.ipcRenderer.invoke(channel, ...args);
  },
  on: (channel, callback) => {
    electron.ipcRenderer.on(channel, callback);
    return () => {
      electron.ipcRenderer.removeListener(channel, callback);
    };
  },
  off: (channel, callback) => {
    electron.ipcRenderer.removeListener(channel, callback);
  }
};
electron.contextBridge.exposeInMainWorld("api", api);
