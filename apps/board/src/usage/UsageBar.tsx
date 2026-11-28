import { useAtomValue } from "@effect/atom-react";
import { Fragment } from "react";

import { ProviderGlyph } from "./ProviderGlyph";
import { Tooltip } from "../ui/Tooltip";
import { engineProvidersAtom } from "../state/server";
import { describeUsage, UNAVAILABLE_DASH } from "./usage";
import { useUsageClock } from "./useUsageClock";

export function UsageBar() {
  const providers = useAtomValue(engineProvidersAtom);
  const now = useUsageClock();
  const usage = describeUsage(providers, now);

  return (
    <footer
      aria-label="Usage"
      className="flex h-7 items-center gap-4 overflow-x-clip border-t border-line bg-sidebar px-3 text-xs text-muted"
    >
      <span>Used</span>
      {usage.map((provider) => (
        <span
          key={provider.instanceId}
          className="flex items-center gap-1.5 whitespace-nowrap"
          data-provider={provider.instanceId}
        >
          <ProviderGlyph driver={provider.driver} />
          {provider.segments.map((segment, index) => (
            <Fragment key={segment.key}>
              {index > 0 && <span aria-hidden>·</span>}
              <Tooltip text={segment.title}>
                <span
                  tabIndex={0}
                  className={segment.text === UNAVAILABLE_DASH ? "text-faint" : "text-fg"}
                >
                  {segment.text}
                </span>
              </Tooltip>
            </Fragment>
          ))}
        </span>
      ))}
    </footer>
  );
}
