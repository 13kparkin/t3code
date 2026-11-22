import { describe, expect, it } from "vite-plus/test";

import { attachmentInputs, pastedFiles, sentAttachment } from "./attachments";

const MIB = 1024 * 1024;

describe("attachmentInputs", () => {
  it("turns a markdown file and a PNG into literal upload requests", () => {
    const result = attachmentInputs([
      { name: "spec.md", type: "", size: 120 },
      { name: "shot.png", type: "image/png", size: 2048 },
    ]);
    expect(result).toEqual({
      inputs: [
        { type: "file", name: "spec.md", mimeType: "application/octet-stream", sizeBytes: 120 },
        { type: "image", name: "shot.png", mimeType: "image/png", sizeBytes: 2048 },
      ],
    });
    if ("inputs" in result) {
      expect(sentAttachment(result.inputs[1]!, "att-1")).toEqual({
        type: "image",
        id: "att-1",
        name: "shot.png",
        mimeType: "image/png",
        sizeBytes: 2048,
      });
    }
  });

  it("rejects a file over 50 MiB with T3's own message", () => {
    expect(
      attachmentInputs([{ name: "big.pdf", type: "application/pdf", size: 50 * MIB + 1 }]),
    ).toEqual({ error: "'big.pdf' exceeds the 50 MB attachment limit." });
  });
});

describe("pastedFiles", () => {
  const png = new File(["x"], "image.png", { type: "image/png" });
  const txt = new File(["x"], "a.txt", { type: "text/plain" });

  it.each([
    ["an image beside its text", [png], "alt text", true],
    ["a file alone", [txt], "", true],
    ["a file beside text", [txt], "copied cells", false],
    ["text alone", [], "hello", false],
  ])("%s", (_name, files, text, attached) => {
    expect(pastedFiles(files, text).length > 0).toBe(attached);
  });
});
