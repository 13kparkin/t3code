import * as Option from "effect/Option";
import { describe, expect, it } from "vite-plus/test";

import { decodeToastRecord, toastXml } from "./callToasts";

const TOAST = {
  projectId: "project-1",
  folder: "t3-board",
  board: "Ops & <Planning>",
  request: {
    callId: "call-1",
    boardId: "board-1",
    title: `Design "sync" & <review>`,
    app: "chrome",
  },
} as const;

const unescape = (text: string) =>
  text
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");

describe("the call start toast", () => {
  const xml = toastXml(TOAST);
  const actions = [...xml.matchAll(/<action ([^>]*)\/>/g)].map((match) =>
    Object.fromEntries(
      [...match[1]!.matchAll(/(\w+)="([^"]*)"/g)].map(([, key, value]) => [key, unescape(value!)]),
    ),
  );

  it("Given a title with markup, then the text is escaped and reads as the title", () => {
    expect(xml).toContain("<text>Design &quot;sync&quot; &amp; &lt;review&gt; is starting</text>");
    expect(xml).toContain("<text>Ops &amp; &lt;Planning&gt;</text>");
  });

  it("Given its Record button pressed, then the activation decodes to the call it names", () => {
    expect(actions[0]).toMatchObject({ content: "Record", activationType: "foreground" });
    expect(decodeToastRecord(actions[0]!["arguments"])).toEqual(Option.some(TOAST));
  });

  it("Given its Dismiss button, then Windows closes the toast without starting the app", () => {
    expect(actions[1]).toEqual({
      content: "Dismiss",
      arguments: "dismiss",
      activationType: "system",
    });
    expect(decodeToastRecord("dismiss")).toEqual(Option.none());
  });
});
