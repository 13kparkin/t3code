import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";

import { describe, expect, it } from "vite-plus/test";

import { ticketStatus } from "../board/ticketStatus";
import { CARD_STATE } from "../domain/forYou";
import { STAGE_TAGS } from "../domain/ticket";
import type { AgentView } from "../state/boardModel";
import { COLORS, PALETTE, toneStyle } from "./tokens";

const themeCss = NodeFS.readFileSync(new URL("../theme.css", import.meta.url), "utf8");
const tailwindCss = NodeFS.readFileSync(
  NodeModule.createRequire(import.meta.url).resolve("tailwindcss/theme.css"),
  "utf8",
);

// Björn Ottosson's OKLab matrices, then the sRGB transfer curve.
function oklchHex(lightness: number, chroma: number, hue: number): string {
  const a = chroma * Math.cos((hue * Math.PI) / 180);
  const b = chroma * Math.sin((hue * Math.PI) / 180);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return `#${rgb
    .map((x) => {
      const v = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
      return Math.round(Math.min(1, Math.max(0, v)) * 255)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;
}

const agent = (overrides: Partial<AgentView>): AgentView => ({
  threadId: "t",
  title: "[T-1] builder",
  role: "builder",
  registered: true,
  outsideRegistry: false,
  ticketKey: "T-1",
  driver: null,
  runState: "stopped",
  pendingRequest: false,
  waitingOnChildren: false,
  latestRunId: null,
  branch: null,
  parentThreadId: null,
  round: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("board tokens", () => {
  it("theme.css declares exactly the token colours", () => {
    const declared = Object.fromEntries(
      [...themeCss.matchAll(/--color-([a-z]+): (#[0-9a-f]{6});/g)].map(([, name, hex]) => [
        name,
        hex,
      ]),
    );
    expect(declared).toEqual(COLORS);
  });

  it("each palette step is Tailwind's OKLCH colour in sRGB", () => {
    for (const [step, hex] of Object.entries(PALETTE)) {
      const match = new RegExp(`--color-${step}: oklch\\(([\\d.]+)% ([\\d.]+) ([\\d.]+)\\)`).exec(
        tailwindCss,
      );
      expect(match, step).not.toBeNull();
      const [, l, c, h] = match ?? [];
      expect(oklchHex(Number(l) / 100, Number(c), Number(h)), step).toBe(hex);
    }
  });

  it("resolves tone classes, with an opacity step as an alpha byte", () => {
    expect(toneStyle("bg-amber-500/15 text-amber-300")).toEqual({
      backgroundColor: "#fe9a0026",
      color: "#ffd230",
    });
    expect(toneStyle("bg-faint")).toEqual({ backgroundColor: "#6c7179" });
    expect(toneStyle("text-blue-300")).toEqual({ color: "#8ec5ff" });
  });

  it("resolves every tone the stage tags, status dots and For you chips use", () => {
    const now = Date.parse("2026-01-01T00:00:00.000Z");
    const statuses = [
      agent({ pendingRequest: true }),
      agent({ runState: "working" }),
      agent({ waitingOnChildren: true, updatedAt: "2025-12-31T00:00:00.000Z" }),
      agent({ runState: "failed" }),
      agent({}),
    ].map((row) => ticketStatus([row], now)?.tone ?? "");
    const tones = [
      ...Object.values(STAGE_TAGS).map(({ tone }) => tone),
      ...statuses,
      ...Object.values(CARD_STATE).map(({ chip }) => chip),
    ];
    for (const tone of tones) {
      expect(Object.keys(toneStyle(tone)).length, tone).toBe(tone.split(" ").length);
    }
  });
});
