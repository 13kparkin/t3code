import { describe, expect, it } from "vite-plus/test";

import type { BoardStoreHost } from "../connection/engineState";
import type { ProjectFiles } from "./boardFiles";
import { boardDirOf, projectKeyOf, routeFiles } from "./routedFiles";

const CWD = "/home/me/proj";
const KEY = projectKeyOf(CWD);

function fakes(stored: Record<string, string>, inProject: Record<string, string> = {}) {
  const project: ProjectFiles = {
    list: async (_cwd, directory) =>
      Object.keys(inProject)
        .filter((path) => path.startsWith(`${directory}/`))
        .map((path) => ({
          path: path
            .split("/")
            .slice(0, directory.split("/").length + 1)
            .join("/"),
          kind: "directory",
        })),
    read: async (_cwd, path) => inProject[path] ?? null,
    write: async (_cwd, path, contents) => void (inProject[path] = contents),
  };
  const store: BoardStoreHost = {
    list: async (path) => {
      const names = Object.keys(stored)
        .filter((file) => file.startsWith(`${path}/`))
        .map((file) => file.slice(path.length + 1).split("/")[0]!);
      return names.length === 0
        ? null
        : [...new Set(names)].map((name) => ({
            path: `${path}/${name}`,
            kind: stored[`${path}/${name}`] === undefined ? "directory" : "file",
          }));
    },
    read: async (path) => stored[path] ?? null,
    write: async (path, contents) => void (stored[path] = contents),
    move: async () => undefined,
    root: async () => "/home/me/.t3/board",
  };
  return { files: routeFiles(project, store), store, stored, inProject };
}

describe("a board's files in the global store", () => {
  it("Given one board in the project and one in the store, when the boards are listed, then both are", async () => {
    const { files } = fakes(
      { [`${KEY}/moved/board.json`]: "{}" },
      { ".agentboard/here/board.json": "{}" },
    );
    const entries = await files.list(CWD, ".agentboard");
    expect(entries?.map((entry) => entry.path).toSorted()).toEqual([
      ".agentboard/here",
      ".agentboard/moved",
    ]);
  });

  it("Given a stored board, when its files are read and written, then they go to the store and a project board's stay in the project", async () => {
    const { files, stored, inProject } = fakes(
      { [`${KEY}/moved/board.json`]: "{}", [`${KEY}/moved/tickets.json`]: "[1]" },
      { ".agentboard/here/tickets.json": "[2]" },
    );
    expect(await files.read(CWD, ".agentboard/moved/tickets.json")).toBe("[1]");
    expect(await files.read(CWD, ".agentboard/here/tickets.json")).toBe("[2]");
    await files.write(CWD, ".agentboard/moved/foryou.jsonl", "x");
    await files.write(CWD, ".agentboard/here/foryou.jsonl", "y");
    expect(stored[`${KEY}/moved/foryou.jsonl`]).toBe("x");
    expect(inProject[".agentboard/here/foryou.jsonl"]).toBe("y");
  });

  it("Given a path outside the boards folder, when it is read, then the project answers", async () => {
    const { files } = fakes({}, { ".omp/artifacts/T-1/a.md": "a" });
    expect(await files.read(CWD, ".omp/artifacts/T-1/a.md")).toBe("a");
  });
});

describe("the folder an agent works in", () => {
  it("Given a moved board and one still in the project, when their folders are asked, then the moved one is in the store", async () => {
    const { store } = fakes({ [`${KEY}/moved/board.json`]: "{}" });
    expect(await boardDirOf(store, CWD, "moved")).toBe(`/home/me/.t3/board/${KEY}/moved`);
    expect(await boardDirOf(store, CWD, "here")).toBe(`${CWD}/.agentboard/here`);
    expect(await boardDirOf(undefined, CWD, "moved")).toBe(`${CWD}/.agentboard/moved`);
  });
});
