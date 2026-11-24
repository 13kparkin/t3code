import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { createBoardStore } from "./boardStore";

const folders: string[] = [];
const scratch = () => {
  const folder = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "board-store-"));
  folders.push(folder);
  return folder;
};

afterEach(() => {
  for (const folder of folders.splice(0)) NodeFS.rmSync(folder, { recursive: true, force: true });
});

const write = (file: string, contents: string | Buffer) => {
  NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
  NodeFS.writeFileSync(file, contents);
};

describe("board store", () => {
  it("Given a path that climbs out of the store, when read or written, then it is refused", () => {
    const store = createBoardStore(scratch());
    expect(() => store.read("../outside.txt")).toThrow();
    expect(() => store.write("a/../../outside.txt", "x")).toThrow();
  });

  it("Given a project root that is not absolute, when a board moves, then it is refused", async () => {
    await expect(
      createBoardStore(scratch()).move({
        direction: "to-store",
        projectRoot: "relative/dir",
        key: "k",
        slug: "main",
      }),
    ).rejects.toThrow(/absolute/i);
  });

  it("Given files written, when listed and read, then a missing file reads null and a missing folder lists null", () => {
    const store = createBoardStore(scratch());
    store.write("key/main/tickets.json", "[]");
    expect(store.read("key/main/tickets.json")).toBe("[]");
    expect(store.read("key/main/none.json")).toBeNull();
    expect(store.list("key/main")).toEqual([{ path: "key/main/tickets.json", kind: "file" }]);
    expect(store.list("key/other")).toBeNull();
  });

  it("Given a board in the project, when it moves to the store and back, then every file arrives intact, binary too, and only the side it left loses its board.json", async () => {
    const root = scratch();
    const project = scratch();
    const store = createBoardStore(root);
    const png = Buffer.from([0, 255, 1, 254, 2]);
    const original = NodePath.join(project, ".agentboard", "main");
    write(NodePath.join(original, "board.json"), '{"id":"b"}');
    write(NodePath.join(original, "tickets.json"), "[]");
    write(NodePath.join(original, "artifacts", "T-1", "smoke.png"), png);

    await store.move({ direction: "to-store", projectRoot: project, key: "proj-1", slug: "main" });
    const global = NodePath.join(root, "proj-1", "main");
    expect(NodeFS.readFileSync(NodePath.join(global, "artifacts", "T-1", "smoke.png"))).toEqual(
      png,
    );
    expect(NodeFS.existsSync(NodePath.join(global, "board.json"))).toBe(true);
    expect(NodeFS.existsSync(NodePath.join(original, "board.json"))).toBe(false);
    expect(NodeFS.existsSync(NodePath.join(original, "board.json.moved"))).toBe(true);

    await store.move({
      direction: "to-project",
      projectRoot: project,
      key: "proj-1",
      slug: "main",
    });
    expect(NodeFS.readFileSync(NodePath.join(original, "artifacts", "T-1", "smoke.png"))).toEqual(
      png,
    );
    expect(NodeFS.existsSync(NodePath.join(original, "board.json"))).toBe(true);
    expect(NodeFS.existsSync(NodePath.join(original, "board.json.moved"))).toBe(false);
    expect(NodeFS.existsSync(NodePath.join(global, "board.json"))).toBe(false);
  });

  it("Given a copy that does not match its source, when the move verifies it, then nothing flips", async () => {
    const root = scratch();
    const project = scratch();
    const store = createBoardStore(root);
    const original = NodePath.join(project, ".agentboard", "main");
    write(NodePath.join(original, "board.json"), '{"id":"b"}');
    write(NodePath.join(original, "tickets.json"), "[]");
    await expect(
      store.move(
        { direction: "to-store", projectRoot: project, key: "k", slug: "main" },
        {
          afterCopy: (target) => NodeFS.writeFileSync(NodePath.join(target, "tickets.json"), "[1]"),
        },
      ),
    ).rejects.toThrow(/verify/i);
    expect(NodeFS.existsSync(NodePath.join(original, "board.json"))).toBe(true);
    expect(NodeFS.existsSync(NodePath.join(root, "k", "main", "board.json.moved"))).toBe(false);
  });

  it("Given a move that ran once, when it runs again, then it ends in the same state", async () => {
    const root = scratch();
    const project = scratch();
    const store = createBoardStore(root);
    const original = NodePath.join(project, ".agentboard", "main");
    write(NodePath.join(original, "board.json"), '{"id":"b"}');
    const input = { direction: "to-store", projectRoot: project, key: "k", slug: "main" } as const;
    await store.move(input);
    await store.move(input);
    expect(NodeFS.existsSync(NodePath.join(root, "k", "main", "board.json"))).toBe(true);
    expect(NodeFS.existsSync(NodePath.join(original, "board.json.moved"))).toBe(true);
  });
});
