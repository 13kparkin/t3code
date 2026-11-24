import { AtomRegistry } from "effect/reactivity";
import { describe, expect, it } from "vite-plus/test";

import { chooseTicket, setPanelTab, ticketTabShownAtom } from "../browser/panel";
import {
  closeFile,
  closePage,
  filesViewAtom,
  openCardPage,
  openFile,
  openTicketPage,
  showBoard,
  showFile,
  showSurface,
} from "./filesView";

const readme = { cwd: "/p", path: "README.md" };
const index = { cwd: "/p", path: "src/index.ts" };

describe("the main view's shown tab", () => {
  it("Given a file shown, when a browser tab is shown then a file is shown again, then each step leaves one tab shown", () => {
    const registry = AtomRegistry.make();
    openFile(registry, readme);
    expect(registry.get(filesViewAtom)).toMatchObject({ active: readme, surface: null });

    showSurface(registry, "page");
    expect(registry.get(filesViewAtom)).toMatchObject({ active: null, surface: "page" });

    showFile(registry, readme);
    expect(registry.get(filesViewAtom)).toMatchObject({ active: readme, surface: null });
  });

  it("Given a browser tab shown, when a file closes then the browser tab stays shown, and the board's tab returns the canvas with the files still open", () => {
    const registry = AtomRegistry.make();
    openFile(registry, readme);
    openFile(registry, index);
    showSurface(registry, "agents");
    closeFile(registry, readme);
    expect(registry.get(filesViewAtom)).toMatchObject({
      tabs: [index],
      active: null,
      surface: "agents",
    });

    showBoard(registry);
    expect(registry.get(filesViewAtom)).toMatchObject({
      tabs: [index],
      active: null,
      surface: null,
    });
  });

  it("Given the ticket's tab, when it closes while shown, then the canvas returns, and closing it from behind a file leaves the file shown", () => {
    const registry = AtomRegistry.make();
    openTicketPage(registry);
    expect(registry.get(filesViewAtom)).toMatchObject({ ticket: true, surface: "ticket" });
    closePage(registry, "ticket");
    expect(registry.get(filesViewAtom)).toMatchObject({
      ticket: false,
      surface: null,
      active: null,
    });

    openTicketPage(registry);
    openFile(registry, readme);
    closePage(registry, "ticket");
    expect(registry.get(filesViewAtom)).toMatchObject({ ticket: false, active: readme });
  });

  it("Given a For you card's tab, when it closes while shown, then the canvas returns, and the ticket's tab stays open", () => {
    const registry = AtomRegistry.make();
    openTicketPage(registry);
    openCardPage(registry, "q-1");
    expect(registry.get(filesViewAtom)).toMatchObject({
      ticket: true,
      card: "q-1",
      surface: "card",
    });
    closePage(registry, "card");
    expect(registry.get(filesViewAtom)).toMatchObject({
      ticket: true,
      card: null,
      surface: null,
      active: null,
    });
  });
});

describe("the ticket's details", () => {
  it("Given the ticket page shows, when an agent on it is chosen, then the details render once", () => {
    const registry = AtomRegistry.make();
    chooseTicket(registry, { threadId: null, ticketKey: "T-1" });
    openTicketPage(registry);
    setPanelTab(registry, "chat");

    chooseTicket(registry, { threadId: "th-1", ticketKey: "T-1" });

    const copies =
      Number(registry.get(filesViewAtom).surface === "ticket") +
      Number(registry.get(ticketTabShownAtom));
    expect(copies).toBe(1);
  });
});
