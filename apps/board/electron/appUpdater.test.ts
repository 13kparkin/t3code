import { describe, expect, it } from "vite-plus/test";

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

function setup(packaged = true) {
  const installs: Array<[boolean, boolean]> = [];
  const feeds: string[] = [];
  let fetches = 0;
  const updater: Updater = {
    setFeedURL: ({ url }) => void feeds.push(url),
    checkForUpdates: () => Promise.resolve({ isUpdateAvailable: true }),
    downloadUpdate: () => Promise.resolve([]),
    quitAndInstall: (isSilent, isForceRunAfter) => void installs.push([isSilent, isForceRunAfter]),
    on: () => undefined,
  };
  const updates = createAppUpdater({
    updater,
    current: "0.2.1",
    packaged,
    fetchReleases: () => {
      fetches += 1;
      return Promise.resolve([release("v9.0.0"), release("board-v0.3.0")]);
    },
    publish: () => undefined,
  });
  return { updates, installs, feeds, fetches: () => fetches };
}

describe("installing the app's update", () => {
  it("Given a newer board release, when checked, then the updater reads that release's files", async () => {
    const { updates, feeds } = setup();
    await updates.check();
    expect(updates.state()).toEqual({ current: "0.2.1", status: "available", version: "0.3.0" });
    expect(feeds).toEqual(["https://github.com/13kparkin/t3code/releases/download/board-v0.3.0"]);
  });

  it("Given an update not yet downloaded, when restart is asked, then the app does not restart", async () => {
    const { updates, installs } = setup();
    await updates.check();
    expect(updates.restart(0)).toBe(false);
    expect(installs).toEqual([]);
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
    const { updates, fetches } = setup(false);
    await updates.check();
    expect(updates.state()).toEqual({ current: "0.2.1", status: "disabled" });
    expect(fetches()).toBe(0);
  });
});
