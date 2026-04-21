/**
 * SoftCard — the canonical large-radius soft-shadow container that landed
 * across the Dashboard (ActiveGoalsCard, UpNextCard, MetricCard, etc.).
 *
 * Before this existed, every page re-implemented the same long Tailwind blob
 * and the design drifted anywhere the copy-paste didn't reach. Components
 * that want the Dashboard look should use <SoftCard>, and components that
 * need something else (e.g. the tight list rows in ApprovalCard) should opt
 * out explicitly rather than silently diverge.
 */
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

type Padding = "default" | "tight" | "roomy" | "none";

const PADDING: Record<Padding, string> = {
  default: "p-7",
  tight: "p-5",
  roomy: "p-8",
  none: "",
};

export interface SoftCardProps extends ComponentPropsWithoutRef<"div"> {
  /** Padding preset. Defaults to "default" (p-7) to match Dashboard cards. */
  padding?: Padding;
}

export function SoftCard({
  className,
  padding = "default",
  ...props
}: SoftCardProps) {
  return (
    <div
      className={cn(
        "rounded-[32px] bg-white dark:bg-card border border-border/40 dark:border-border/40",
        "shadow-[0_1px_2px_rgba(0,0,0,0.02),0_12px_32px_-12px_rgba(0,0,0,0.06)]",
        PADDING[padding],
        className,
      )}
      {...props}
    />
  );
}
