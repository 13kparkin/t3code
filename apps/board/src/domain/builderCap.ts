const MIN_BUILDER_CAP = 1;
export const MAX_BUILDER_CAP = 16;

const GIB_PER_BUILDER = 4;

export function parseBuilderCap(text: string): number | null {
  const cap = /^\d+$/.test(text.trim()) ? Number(text) : Number.NaN;
  return cap >= MIN_BUILDER_CAP && cap <= MAX_BUILDER_CAP ? cap : null;
}

/** One builder per 4 GiB of available memory or per core beyond the first, whichever is fewer. */
export function suggestedBuilders(host: { availableMemoryBytes: number; cpuCount: number }) {
  const byMemory = Math.floor(host.availableMemoryBytes / (GIB_PER_BUILDER * 1024 ** 3));
  const byCores = host.cpuCount - 1;
  return Math.min(MAX_BUILDER_CAP, Math.max(MIN_BUILDER_CAP, Math.min(byMemory, byCores)));
}
