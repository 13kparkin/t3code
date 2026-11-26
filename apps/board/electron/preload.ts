import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

import type {
  AppUpdateState,
  BoardBridge,
  BrowserTabState,
  EngineState,
  RecorderSnapshot,
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
  listAgentSkills: (projectRoot) => ipcRenderer.invoke("board:list-agent-skills", projectRoot),
  listGitWorktrees: (projectRoot) => ipcRenderer.invoke("board:list-git-worktrees", projectRoot),
  headOnOrigin: (worktree) => ipcRenderer.invoke("board:head-on-origin", worktree),
  migrateLegacyEvidence: (artifactsDir, worktrees) =>
    ipcRenderer.invoke("board:migrate-legacy-evidence", artifactsDir, worktrees),
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
  recorder: {
    snapshot: () => ipcRenderer.invoke("board:recorder-state"),
    onSnapshot: (listener) => {
      const handler = (_event: IpcRendererEvent, snapshot: RecorderSnapshot) => listener(snapshot);
      ipcRenderer.on("board:recorder-state", handler);
      return () => void ipcRenderer.off("board:recorder-state", handler);
    },
    start: (request) => ipcRenderer.send("board:recorder-start", request),
    stop: () => ipcRenderer.send("board:recorder-stop"),
    deleteAudio: (callId) => ipcRenderer.invoke("board:recorder-delete", callId),
    openFile: (file) => ipcRenderer.send("board:recording-open", file),
  },
  calls: {
    wakeAt: (epochMs) => ipcRenderer.send("board:call-wake-at", epochMs),
    onWake: (listener) => {
      const handler = () => listener();
      ipcRenderer.on("board:call-wake", handler);
      return () => void ipcRenderer.off("board:call-wake", handler);
    },
    notify: (toast) => ipcRenderer.send("board:call-notify", toast),
    onRecord: (listener) => {
      const handler = () => listener();
      ipcRenderer.on("board:call-record", handler);
      return () => void ipcRenderer.off("board:call-record", handler);
    },
    takeRecord: () => ipcRenderer.invoke("board:call-record-take"),
  },
};

contextBridge.exposeInMainWorld("board", bridge);
