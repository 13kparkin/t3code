import { describe, expect, it } from "vite-plus/test";

import type { ProjectFiles } from "./boardFiles";
import { changeOverlay, readOverlay } from "./ticketOverlay";
import { editOverlay } from "../domain/ticketOverlay";

const CWD = "/work/project";
const FOLDER = "x";
const TICKETS = `.agentboard/${FOLDER}/tickets.json`;
const DETAILS = `.agentboard/${FOLDER}/ticket-details.json`;

function fakeFiles(initial: Record<string, string>) {
  const store = new Map(Object.entries(initial));
  const writes: string[] = [];
  const files: ProjectFiles = {
    list: async () => null,
    read: async (_cwd, path) => store.get(path) ?? null,
    write: async (_cwd, path, contents) => {
      writes.push(path);
      store.set(path, contents);
    },
  };
  return { files, store, writes };
}

describe("the app's ticket-details.json", () => {
  it("Given two edits sent together, when both settle, then both are in the file", async () => {
    const { files, store } = fakeFiles({});
    await Promise.all([
      changeOverlay(files, CWD, FOLDER, (o) => editOverlay(o, "T-1", { title: "A" })),
      changeOverlay(files, CWD, FOLDER, (o) => editOverlay(o, "T-2", { title: "B" })),
    ]);
    expect(JSON.parse(store.get(DETAILS) ?? "")).toEqual({
      "T-1": { edits: { title: "A" } },
      "T-2": { edits: { title: "B" } },
    });
  });

  it("Given the orchestrator's file, when an edit is saved, then only ticket-details.json is written", async () => {
    const { files, store, writes } = fakeFiles({ [TICKETS]: "[]" });
    await changeOverlay(files, CWD, FOLDER, (o) => editOverlay(o, "T-1", { title: "A" }));
    expect([writes, store.get(TICKETS)]).toEqual([[DETAILS], "[]"]);
  });

  it("Given a file the app cannot read, when an edit is saved, then it fails and leaves the file as it was", async () => {
    const { files, store } = fakeFiles({ [DETAILS]: '{"T-1":{"edits":{"title":3}}}' });
    await expect(
      changeOverlay(files, CWD, FOLDER, (o) => editOverlay(o, "T-2", { title: "B" })),
    ).rejects.toThrow("ticket-details.json is invalid");
    expect(store.get(DETAILS)).toBe('{"T-1":{"edits":{"title":3}}}');
  });

  it("Given no file, when it is read, then the overlay is empty", async () => {
    expect(await readOverlay(fakeFiles({}).files, CWD, FOLDER)).toEqual({});
  });
});
