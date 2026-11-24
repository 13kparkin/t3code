import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

import type {
  AppUpdateState,
  BoardBridge,
  BrowserTabState,
  EngineState,
} from "../src/connection/engineState";

const bridge: BoardBridge = {
  reportFirstPaint: (epochMs) => ipcRenderer.send("board:first-paint", epochMs),
  reportEngineConnected: (epochMs) => ipcRenderer.send("board:engine-connected", epochMs),
  logConnection: (line) => ipcRenderer.send("board:connection-log", line),
  engineState: () => ipcRenderer.invoke("board:engine-state"),
  onEngineState: (listener) => {
    const handler = (_event: IpcRendererEvent, state: EngineState) => listener(state);
    ipcRenderer.on("board:engine-state", handler);
    return () => void ipcRenderer.off("board:engine-state", handler);
  },
  engineToken: () => ipcRenderer.invoke("board:engine-token"),
  answerPrompt: (accepted) => ipcRenderer.send("board:prompt-answer", accepted),
  pickFolder: () => ipcRenderer.invoke("board:pick-folder"),
  resolveFolder: (text) => ipcRenderer.invoke("board:resolve-folder", text),
  readLocalState: () => ipcRenderer.invoke("board:local-state-read"),
  writeLocalState: (text) => ipcRenderer.invoke("board:local-state-write", text),
  ensurePstack: () => ipcRenderer.invoke("board:ensure-pstack"),
  store: {
    root: () => ipcRenderer.invoke("board:store-root"),
    list: (path) => ipcRenderer.invoke("board:store-list", path),
    read: (path) => ipcRenderer.invoke("board:store-read", path),
    write: (path, contents) => ipcRenderer.invoke("board:store-write", path, contents),
    move: (input) => ipcRenderer.invoke("board:store-move", input),
  },
  browser: {
    open: (id, url) => ipcRenderer.send("board:browser-open", id, url),
    close: (id) => ipcRenderer.send("board:browser-close", id),
    activate: (id) => ipcRenderer.send("board:browser-activate", id),
    navigate: (id, url) => ipcRenderer.send("board:browser-navigate", id, url),
    history: (id, delta) => ipcRenderer.send("board:browser-history", id, delta),
    reload: (id) => ipcRenderer.send("board:browser-reload", id),
    setBounds: (bounds) => ipcRenderer.send("board:browser-bounds", bounds),
    onTabState: (listener) => {
      const handler = (_event: IpcRendererEvent, state: BrowserTabState) => listener(state);
      ipcRenderer.on("board:browser-tab", handler);
      return () => void ipcRenderer.off("board:browser-tab", handler);
    },
  },
  appUpdate: {
    state: () => ipcRenderer.invoke("board:app-update-state"),
    onState: (listener) => {
      const handler = (_event: IpcRendererEvent, state: AppUpdateState) => listener(state);
      ipcRenderer.on("board:app-update-state", handler);
      return () => void ipcRenderer.off("board:app-update-state", handler);
    },
    download: () => ipcRenderer.send("board:app-update-download"),
    restart: (activeRuns) => ipcRenderer.send("board:app-update-restart", activeRuns),
    setPrereleases: (enabled) => ipcRenderer.send("board:app-update-prereleases", enabled),
  },
};

contextBridge.exposeInMainWorld("board", bridge);
