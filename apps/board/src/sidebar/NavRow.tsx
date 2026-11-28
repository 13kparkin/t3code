import type { NavItem } from "./navItems";
import { SidebarRow } from "./SidebarRow";

export function NavRow({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <SidebarRow
      icon={<Icon className="size-3.5" />}
      title={item.title}
      label={item.label}
      selected={item.selected}
      onClick={item.onPress}
      trailing={
        item.count === null ? undefined : (
          <span
            data-testid={`sidebar-${item.id}-count`}
            className={
              item.urgent
                ? "rounded-full bg-amber-500 px-1.5 text-[10px] leading-4 font-semibold text-black"
                : "text-[11px] text-faint"
            }
          >
            {item.count}
          </span>
        )
      }
    />
  );
}
