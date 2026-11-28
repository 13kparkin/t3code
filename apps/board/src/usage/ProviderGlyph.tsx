import { providerClients } from "@t3tools/client-runtime/provider-clients";
import { isProviderDriverKind } from "@t3tools/contracts";
import { Bot } from "lucide-react";

/** Claude's mark, or the driver's own icon from T3's provider clients in the dark theme's colours. */
export function ProviderGlyph({ driver }: { driver: string }) {
  if (driver === "claudeAgent") {
    return (
      <span aria-hidden className="text-[13px] leading-none text-[#d97757]">
        ✳
      </span>
    );
  }
  const icon = isProviderDriverKind(driver) ? providerClients.get(driver)?.icon : undefined;
  if (icon === undefined) return <Bot aria-hidden className="size-3.5 shrink-0 text-muted" />;
  // shortcut: gradient paths draw in their flat fill, upgrade if an icon looks wrong.
  return (
    <svg aria-hidden viewBox={icon.viewBox} className="size-3.5 shrink-0">
      {icon.paths.map((path) => (
        <path
          key={path.d}
          d={path.d}
          fillRule={path.fillRule}
          fill={(path.fill ?? icon.fill).dark}
        />
      ))}
    </svg>
  );
}
