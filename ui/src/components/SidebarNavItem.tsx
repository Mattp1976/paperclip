import { NavLink } from "@/lib/router";
import { cn } from "../lib/utils";
import { useSidebar } from "../context/SidebarContext";
import type { LucideIcon } from "lucide-react";

interface SidebarNavItemProps {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  className?: string;
  badge?: number;
  badgeTone?: "default" | "danger";
  textBadge?: string;
  textBadgeTone?: "default" | "amber";
  alert?: boolean;
  liveCount?: number;
}

export function SidebarNavItem({
  to,
  label,
  icon: Icon,
  end,
  className,
  badge,
  badgeTone = "default",
  textBadge,
  textBadgeTone = "default",
  alert = false,
  liveCount,
}: SidebarNavItemProps) {
  const { isMobile, setSidebarOpen } = useSidebar();

  return (
    <NavLink
      to={to}
      end={end}
      onClick={() => { if (isMobile) setSidebarOpen(false); }}
      className={({ isActive }) =>
        cn(
          "group relative flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium transition-all duration-150",
          isActive
            ? "bg-gradient-to-br from-[#8FA781] to-[#7C9470] text-white shadow-[0_1px_2px_rgba(94,114,89,0.15),0_8px_16px_-8px_rgba(94,114,89,0.40)] dark:from-[#A4BD95] dark:to-[#8FA781] dark:text-[#22251F]"
            : "text-muted-foreground/80 hover:bg-white/70 dark:hover:bg-white/5 hover:text-foreground",
          className,
        )
      }
    >
      {({ isActive }: { isActive: boolean }) => (
        <>
          <span className="relative shrink-0">
            <Icon
              className={cn(
                "h-[18px] w-[18px]",
                isActive ? "text-white" : "text-muted-foreground/70 group-hover:text-foreground",
              )}
              strokeWidth={isActive ? 2.3 : 2}
            />
            {alert && (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-destructive shadow-[0_0_0_2px_hsl(var(--background))]" />
            )}
          </span>
          <span className="flex-1 truncate">{label}</span>
          {textBadge && (
            <span
              className={cn(
                "ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none",
                isActive
                  ? "bg-white/20 text-white"
                  : textBadgeTone === "amber"
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {textBadge}
            </span>
          )}
          {liveCount != null && liveCount > 0 && (
            <span className="ml-auto flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span
                  className={cn(
                    "animate-pulse absolute inline-flex h-full w-full rounded-full opacity-75",
                    isActive ? "bg-white" : "bg-[#B5C4B1]",
                  )}
                />
                <span
                  className={cn(
                    "relative inline-flex rounded-full h-2 w-2",
                    isActive ? "bg-white" : "bg-primary",
                  )}
                />
              </span>
              <span
                className={cn(
                  "text-[11px] font-medium",
                  isActive ? "text-white" : "text-sage-ink",
                )}
              >
                {liveCount} live
              </span>
            </span>
          )}
          {badge != null && badge > 0 && (
            <span
              className={cn(
                "ml-auto rounded-full px-1.5 py-0.5 text-xs leading-none font-medium",
                isActive
                  ? "bg-white/25 text-white"
                  : badgeTone === "danger"
                    ? "bg-[#C47878] text-white"
                    : "bg-primary text-white dark:text-[#22251F]",
              )}
            >
              {badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}
