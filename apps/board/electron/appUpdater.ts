import { compareSemverVersions, parseSemver } from "@t3tools/shared/semver";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { app, BrowserWindow, ipcMain } from "electron";
import { autoUpdater } from "electron-updater";

import type { AppUpdateState } from "../src/connection/engineState";
import { appUpdateStep } from "../src/state/updates";

const REPOSITORY = "13kparkin/t3code";
const TAG_PREFIX = "board-v";
const FIRST_CHECK_MS = 15_000;
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

const Releases = Schema.Array(
  Schema.Struct({ tag_name: Schema.String, draft: Schema.Boolean, prerelease: Schema.Boolean }),
);
type Releases = typeof Releases.Type;
const decodeReleases = Schema.decodeUnknownOption(Releases);
const decodeCount = Schema.decodeUnknownOption(Schema.Int);

/**
 * The newest board release above `current`, or null. The fork's Releases page also holds T3's own
 * releases, so `/releases/latest` may not be a board release at all.
 */
export function newerRelease(
  releases: Releases,
  current: string,
  prereleases: boolean,
): string | null {
  let newest = current;
  for (const release of releases) {
    if (release.draft || !release.tag_name.startsWith(TAG_PREFIX)) continue;
    const version = release.tag_name.slice(TAG_PREFIX.length);
    const parsed = parseSemver(version);
    if (parsed === null) continue;
    if (!prereleases && (release.prerelease || parsed.prerelease.length > 0)) continue;
    if (compareSemverVersions(version, newest) > 0) newest = version;
  }
  return newest === current ? null : newest;
}

/** The part of electron-updater's `autoUpdater` this module drives. */
export interface Updater {
  readonly setFeedURL: (options: { provider: "generic"; url: string }) => void;
  readonly checkForUpdates: () => Promise<{ isUpdateAvailable: boolean } | null>;
  readonly downloadUpdate: () => Promise<ReadonlyArray<string>>;
  readonly quitAndInstall: (isSilent: boolean, isForceRunAfter: boolean) => void;
  readonly on: (event: "download-progress", listener: (info: { percent: number }) => void) => void;
}

export function createAppUpdater(deps: {
  readonly updater: Updater;
  readonly current: string;
  readonly packaged: boolean;
  readonly fetchReleases: () => Promise<Releases>;
  readonly publish: (state: AppUpdateState) => void;
}) {
  const { updater, current, publish } = deps;
  let state: AppUpdateState = { current, status: deps.packaged ? "unchecked" : "disabled" };
  let prereleases = false;
  let checking = false;
  // Bumped when the test-release switch flips. Work started under the old setting is dropped, then re-run.
  let generation = 0;
  const set = (next: AppUpdateState) => {
    state = next;
    publish(state);
  };

  updater.on("download-progress", ({ percent }) => {
    const rounded = Math.floor(percent);
    if (state.status === "downloading" && rounded !== state.percent) {
      set({ ...state, percent: rounded });
    }
  });

  const check = async () => {
    if (
      checking ||
      state.status === "disabled" ||
      state.status === "downloading" ||
      state.status === "downloaded"
    ) {
      return;
    }
    checking = true;
    const started = generation;
    try {
      const version = newerRelease(await deps.fetchReleases(), current, prereleases);
      if (version === null) return set({ current, status: "current" });
      updater.setFeedURL({
        provider: "generic",
        url: `https://github.com/${REPOSITORY}/releases/download/${TAG_PREFIX}${version}`,
      });
      const result = await updater.checkForUpdates();
      if (started !== generation) return set({ current, status: "unchecked" });
      set(
        result?.isUpdateAvailable === true
          ? { current, status: "available", version }
          : { current, status: "current" },
      );
    } catch (error) {
      if (appUpdateStep(state, 0) !== "download") {
        set({ current, status: "error", message: String(error), version: null });
      }
    } finally {
      checking = false;
      if (started !== generation) await check();
    }
  };

  const download = async () => {
    const version =
      appUpdateStep(state, 0) === "download" && "version" in state ? state.version : null;
    if (checking || version === null) return;
    set({ current, status: "downloading", version, percent: 0 });
    const started = generation;
    const next = await updater.downloadUpdate().then(
      (): AppUpdateState => ({ current, status: "downloaded", version }),
      (error): AppUpdateState => ({ current, status: "error", message: String(error), version }),
    );
    if (started === generation) return set(next);
    set({ current, status: "unchecked" });
    await check();
  };

  return {
    state: () => state,
    check,
    download,
    /** Installs only with the operator's go, which carries the renderer's count of active runs. */
    restart: (activeRuns: number) => {
      if (appUpdateStep(state, activeRuns) !== "restart") return false;
      updater.quitAndInstall(true, true);
      return true;
    },
    setPrereleases: (enabled: boolean) => {
      if (enabled === prereleases) return;
      prereleases = enabled;
      generation += 1;
      // Turning test releases off must not leave a pre-release offered or ready to install.
      // A running download is dropped when it lands.
      if (!enabled && state.status !== "downloading" && "version" in state) {
        set({ current, status: "unchecked" });
      }
      void check();
    },
  };
}

export function registerAppUpdater() {
  // Reading `autoUpdater` builds the updater, which throws on a dev build's version; electron-updater skips unpackaged apps too.
  if (!app.isPackaged) {
    ipcMain.handle("board:app-update-state", () => ({
      current: app.getVersion(),
      status: "disabled",
    }));
    return;
  }
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  const updates = createAppUpdater({
    updater: autoUpdater,
    current: app.getVersion(),
    packaged: true,
    fetchReleases: async () => {
      const response = await fetch(
        `https://api.github.com/repos/${REPOSITORY}/releases?per_page=100`,
        {
          headers: { accept: "application/vnd.github+json" },
        },
      );
      if (!response.ok) throw new Error(`GitHub answered ${response.status}.`);
      return Option.getOrThrowWith(
        decodeReleases(await response.json()),
        () => new Error("GitHub sent an unexpected release list."),
      );
    },
    publish: (state) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send("board:app-update-state", state);
      }
    },
  });
  ipcMain.handle("board:app-update-state", () => updates.state());
  ipcMain.on("board:app-update-download", () => void updates.download());
  ipcMain.on("board:app-update-restart", (_event, activeRuns) =>
    Option.map(decodeCount(activeRuns), updates.restart),
  );
  ipcMain.on("board:app-update-prereleases", (_event, enabled) =>
    updates.setPrereleases(enabled === true),
  );
  setTimeout(() => void updates.check(), FIRST_CHECK_MS);
  setInterval(() => void updates.check(), CHECK_EVERY_MS);
}
