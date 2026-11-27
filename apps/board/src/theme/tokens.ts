/** The board's colours. theme.css repeats them for Tailwind, and tokens.test.ts keeps the two equal. */
export const COLORS = {
  bg: "#151618",
  dot: "#2d3036",
  panel: "#1e2023",
  line: "#2f3237",
  fg: "#ebebed",
  muted: "#a2a6ad",
  faint: "#6c7179",
  sidebar: "#1a1b1e",
  hover: "#26292d",
  message: "#2b2e33",
  focus: "#60a5fa",
  offline: "#6c7179",
} as const;

/** The Tailwind steps the board's tone classes use, as sRGB hex, since React Native cannot read Tailwind's OKLCH. */
export const PALETTE = {
  "zinc-300": "#d4d4d8",
  "zinc-400": "#9f9fa9",
  "red-300": "#ffa2a2",
  "red-400": "#ff6467",
  "orange-300": "#ffb86a",
  "amber-300": "#ffd230",
  "amber-400": "#ffb900",
  "amber-500": "#fe9a00",
  "emerald-300": "#5ee9b5",
  "emerald-400": "#00d492",
  "emerald-500": "#00bc7d",
  "cyan-300": "#53eafd",
  "sky-300": "#74d4ff",
  "sky-400": "#00bcff",
  "sky-500": "#00a6f4",
  "blue-300": "#8ec5ff",
  "indigo-300": "#a3b3ff",
  "violet-300": "#c4b4ff",
} as const;

type ToneStyle = { color?: string; backgroundColor?: string };

const HEX: ReadonlyMap<string, string> = new Map([
  ...Object.entries(COLORS),
  ...Object.entries(PALETTE),
]);
const TONE = /^(bg|text)-([a-z]+(?:-\d+)?)(?:\/(\d+))?$/;

/** A board tone class string, such as `bg-amber-500/15 text-amber-300`, as a React Native style. */
export function toneStyle(classes: string): ToneStyle {
  const style: ToneStyle = {};
  for (const name of classes.split(" ")) {
    const [, kind, color, alpha] = TONE.exec(name) ?? [];
    const hex = color === undefined ? undefined : HEX.get(color);
    if (hex === undefined) continue;
    const value =
      alpha === undefined
        ? hex
        : `${hex}${Math.round((Number(alpha) / 100) * 255)
            .toString(16)
            .padStart(2, "0")}`;
    if (kind === "bg") style.backgroundColor = value;
    else style.color = value;
  }
  return style;
}
