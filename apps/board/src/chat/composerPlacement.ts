/** Where the orchestrator's composer sits: under the thread in the side panel, or over the canvas, resting in the corner or open in the center. */
export type ComposerPlacement = "sidebar" | "corner" | "center";

export function composerPlacement(input: {
  /** The side panel is open on the chat tab. */
  readonly threadShown: boolean;
  /** Focus is inside the composer. */
  readonly focused: boolean;
  /** The composer holds text or files, or its model menu is open. */
  readonly filled: boolean;
}): ComposerPlacement {
  if (input.threadShown) return "sidebar";
  return input.focused || input.filled ? "center" : "corner";
}
