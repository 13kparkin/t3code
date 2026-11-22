import { describe, expect, it, vi } from "vite-plus/test";

import type { AppUpdateState } from "../src/connection/engineState";

import { createAppUpdater, newerRelease, type Updater } from "./appUpdater";

const release = (tag_name: string, fields: { draft?: boolean; prerelease?: boolean } = {}) => ({
  tag_name,
  draft: fields.draft ?? false,
  prerelease: fields.prerelease ?? false,
});

describe("picking the newer board release", () => {
  it.each([
    ["a newer board release", [release("board-v0.3.0")], false, "0.3.0"],
    ["the same version", [release("board-v0.2.1")], false, null],
    ["an older version", [release("board-v0.2.0")], false, null],
    [
      "a newer T3 release on the same page",
      [release("v9.0.0"), release("board-v0.2.0")],
      false,
      null,
    ],
    ["a tag that is not a version", [release("board-vnext")], false, null],
    ["a draft", [release("board-v0.3.0", { draft: true })], false, null],
    [
      "a pre-release with the setting off",
      [release("board-v0.3.0", { prerelease: true })],
      false,
      null,
    ],
    ["a pre-release version with the setting off", [release("board-v0.3.0-test")], false, null],
    [
      "a pre-release with the setting on",
      [release("board-v0.3.0-test", { prerelease: true })],
      true,
      "0.3.0-test",
    ],
    [
      "several releases out of order",
      [release("board-v0.2.5"), release("board-v0.4.0"), release("board-v0.3.0")],
      false,
      "0.4.0",
    ],
  ])(
    "Given %s, when compared with 0.2.1, then it offers %s",
    (_case, releases, prereleases, offered) => {
      expect(newerRelease(releases, "0.2.1", prereleases)).toBe(offered);
    },
  );
});

function setup({
  packaged = true,
  releases = [release("v9.0.0"), release("board-v0.3.0")],
  ...overrides
}: Partial<Updater> & { packaged?: boolean; releases?: ReturnType<typeof release>[] } = {}) {
  const installs: Array<[boolean, boolean]> = [];
  const feeds: string[] = [];
  let fetches = 0;
  const updater: Updater = {
    setFeedURL: ({ url }) => void feeds.push(url),
    checkForUpdates: () => Promise.resolve({ isUpdateAvailable: true }),
    downloadUpdate: () => Promise.resolve([]),
    quitAndInstall: (isSilent, isForceRunAfter) => void installs.push([isSilent, isForceRunAfter]),
    on: () => undefined,
    ...overrides,
  };
  const waiters: Array<(state: AppUpdateState) => void> = [];
  const updates = createAppUpdater({
    updater,
    current: "0.2.1",
    packaged,
    fetchReleases: () => {
      fetches += 1;
      return Promise.resolve(releases);
    },
    publish: (state) => waiters.shift()?.(state),
  });
  const nextState = () => new Promise<AppUpdateState>((resolve) => void waiters.push(resolve));
  return { updates, installs, feeds, fetches: () => fetches, nextState };
}

describe("installing the app's update", () => {
  it("Given a newer board release, when checked, then the updater reads that release's files", async () => {
    const { updates, feeds } = setup();
    await updates.check();
    expect(updates.state()).toEqual({ current: "0.2.1", status: "available", version: "0.3.0" });
    expect(feeds).toEqual(["https://github.com/13kparkin/t3code/releases/download/board-v0.3.0"]);
  });

  it("Given a downloaded update and an active run, when restart is asked, then the app does not restart", async () => {
    const { updates, installs } = setup();
    await updates.check();
    await updates.download();
    expect(updates.restart(2)).toBe(false);
    expect(installs).toEqual([]);
  });

  it("Given a downloaded update and no active run, when restart is asked, then it installs silently and relaunches", async () => {
    const { updates, installs } = setup();
    await updates.check();
    await updates.download();
    expect(updates.state().status).toBe("downloaded");
    expect(updates.restart(0)).toBe(true);
    expect(installs).toEqual([[true, true]]);
  });

  it("Given a build that is not packaged, when checked, then it never asks GitHub", async () => {
    const { updates, fetches } = setup({ packaged: false });
    await updates.check();
    expect(updates.state()).toEqual({ current: "0.2.1", status: "disabled" });
    expect(fetches()).toBe(0);
  });

  it.each([
    ["an available update", { downloadUpdate: () => Promise.resolve([]) }, "available", null],
    [
      "a failed download",
      { downloadUpdate: () => Promise.reject(new Error("disk full")) },
      "error",
      "Error: disk full",
    ],
  ])(
    "Given %s, when a later check fails, then the offer stays",
    async (_case, overrides, status, message) => {
      const { updates } = setup({
        ...overrides,
        checkForUpdates: vi
          .fn<Updater["checkForUpdates"]>()
          .mockResolvedValueOnce({ isUpdateAvailable: true })
          .mockRejectedValueOnce(new Error("offline")),
      });
      await updates.check();
      if (status === "error") await updates.download();
      await updates.check();
      expect(updates.state()).toEqual({
        current: "0.2.1",
        status,
        version: "0.3.0",
        ...(message === null ? {} : { message }),
      });
    },
  );
});

describe("turning test releases off", () => {
  const prerelease = { releases: [release("board-v0.3.0-test", { prerelease: true })] };

  it.each([
    ["an available", null],
    ["a downloaded", () => Promise.resolve([])],
    ["a failed download of a", () => Promise.reject(new Error("disk full"))],
  ])(
    "Given %s pre-release, when the switch goes off, then it is no longer offered",
    async (_case, downloadUpdate) => {
      const { updates, nextState } = setup({
        ...prerelease,
        ...(downloadUpdate === null ? {} : { downloadUpdate }),
      });
      const offered = nextState();
      updates.setPrereleases(true);
      await offered;
      if (downloadUpdate !== null) await updates.download();
      updates.setPrereleases(false);
      expect(updates.state()).toEqual({ current: "0.2.1", status: "unchecked" });
    },
  );

  it("Given a running check, when the switch goes off, then its pre-release is not offered", async () => {
    const asked = Promise.withResolvers<void>();
    const answer = Promise.withResolvers<{ isUpdateAvailable: boolean }>();
    const { updates, nextState } = setup({
      ...prerelease,
      checkForUpdates: () => {
        asked.resolve();
        return answer.promise;
      },
    });
    updates.setPrereleases(true);
    await asked.promise;
    updates.setPrereleases(false);
    const dropped = nextState();
    const fresh = nextState();
    answer.resolve({ isUpdateAvailable: true });
    expect(await dropped).toEqual({ current: "0.2.1", status: "unchecked" });
    expect(await fresh).toEqual({ current: "0.2.1", status: "current" });
  });

  it("Given a running pre-release download, when the switch goes off, then Restart cannot install it", async () => {
    const downloaded = Promise.withResolvers<ReadonlyArray<string>>();
    const { updates, nextState, installs } = setup({
      ...prerelease,
      downloadUpdate: () => downloaded.promise,
    });
    const offered = nextState();
    updates.setPrereleases(true);
    await offered;
    const downloading = updates.download();
    updates.setPrereleases(false);
    downloaded.resolve([]);
    await downloading;
    expect(updates.state()).toEqual({ current: "0.2.1", status: "current" });
    expect(updates.restart(0)).toBe(false);
    expect(installs).toEqual([]);
  });

  it("Given a running stable download, when the switch goes on, then the app is offered a fresh update", async () => {
    const downloaded = Promise.withResolvers<ReadonlyArray<string>>();
    const { updates } = setup({ downloadUpdate: () => downloaded.promise });
    await updates.check();
    const downloading = updates.download();
    updates.setPrereleases(true);
    downloaded.resolve([]);
    await downloading;
    expect(updates.state()).toEqual({ current: "0.2.1", status: "available", version: "0.3.0" });
  });
});
