import { type LinuxHost, shellQuote } from "./wslEngine";

const BODY = String.raw`
missing() {
  list=$(cd "$1" && find . ! -type d) || { echo "cannot list $1"; return; }
  printf '%s\n' "$list" | while IFS= read -r file; do
    [ -z "$file" ] || [ -e "$2/$file" ] || [ -L "$2/$file" ] || { echo "$file is not on the board"; break; }
  done
}
migrate() {
  [ -z "$(missing "$1" "$2")" ] && return 0
  rm -rf "$2.partial" && mkdir -p "$2.partial" "$2" && cp -R "$1/." "$2.partial/" || return 1
  # GNU cp 9.2 exits 1 when -n skips a file, so the check below decides instead of its status.
  cp -Rn "$2.partial/." "$2/" 2>/dev/null
  rm -rf "$2.partial"
}
for tree in "$@"; do
  src="$tree/.omp/artifacts"
  if [ ! -d "$src" ]; then printf 'nothing\t%s\n' "$tree"; continue; fi
  reason=""
  copied=""
  for entry in "$src"/*; do
    [ -e "$entry" ] || continue
    key=$(basename "$entry")
    if [ ! -d "$entry" ]; then reason="$key is not in a ticket folder"; break; fi
    copied=1
    out=$(migrate "$entry" "$board/$key" 2>&1) || { reason="$key: $out"; break; }
    gap=$(missing "$entry" "$board/$key")
    [ -z "$gap" ] || { reason="$key: $gap"; break; }
  done
  if [ -n "$reason" ]; then
    printf 'failed\t%s\t%s\n' "$tree" "$(printf '%s' "$reason" | tr '\t\n' '  ')"
  elif [ -n "$copied" ]; then
    printf 'migrated\t%s\n' "$tree"
  else
    printf 'nothing\t%s\n' "$tree"
  fi
done
`;

export function migrationScript(artifactsDir: string, worktrees: ReadonlyArray<string>): string {
  return [
    `board=${shellQuote(artifactsDir)}`,
    `set -- ${worktrees.map(shellQuote).join(" ")}`,
    BODY,
  ].join("\n");
}

export async function migrateLegacyEvidence(
  host: Pick<LinuxHost, "shell">,
  artifactsDir: string,
  worktrees: ReadonlyArray<string>,
): Promise<string> {
  if (!artifactsDir.startsWith("/") || worktrees.length === 0) return "";
  const result = await host.shell(migrationScript(artifactsDir, worktrees), { timeoutMs: 120_000 });
  return result.stdout;
}
