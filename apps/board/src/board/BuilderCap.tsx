import { RegistryContext, useAtomValue } from "@effect/atom-react";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import { useContext, useState } from "react";

import { MAX_BUILDER_CAP, parseBuilderCap, suggestedBuilders } from "../domain/builderCap";
import { setBoardBuilderCap } from "../state/builderCap";
import { serverEnvironment } from "../state/server";
import type { ValidBoard } from "../store/boardFiles";

export function BuilderCap({
  project,
  listed,
  builders,
}: {
  project: EnvironmentProject;
  listed: ValidBoard;
  builders: number;
}) {
  const registry = useContext(RegistryContext);
  const saved = listed.board.builderCap;
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const host = useAtomValue(
    serverEnvironment.hostResources({ environmentId: project.environmentId, input: {} }),
  );
  const text = draft ?? String(saved);
  const commit = () => {
    if (draft === null) return;
    const cap = parseBuilderCap(text);
    setDraft(null);
    if (cap === null) {
      setError(`The cap is a whole number from 1 to ${MAX_BUILDER_CAP}.`);
      return;
    }
    setError(null);
    if (cap !== saved) void setBoardBuilderCap(registry, project, listed, cap).then(setError);
  };
  return (
    <span className="inline-flex flex-col items-end text-muted">
      <span>
        <span data-testid="builders" className="text-fg">
          {builders} of{" "}
        </span>
        <input
          data-testid="builder-cap"
          aria-label="Builder cap"
          inputMode="numeric"
          value={text}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
          onPointerDown={(event) => event.stopPropagation()}
          className="w-8 rounded border border-line bg-transparent px-1 text-center text-fg"
        />
      </span>
      {host._tag === "Success" && (
        <span data-testid="suggested-max" className="text-[11px] text-faint">
          suggested max {suggestedBuilders(host.value)}
        </span>
      )}
      {error !== null && (
        <span role="alert" className="text-[11px] break-words text-red-400">
          {error}
        </span>
      )}
    </span>
  );
}
