/**
 * AdvancedSection — the standard disclosure for "power-user" settings.
 *
 * Use this to hide a block of settings behind a single tap. The pattern keeps
 * the primary settings surface calm (only the options most users touch) while
 * still letting advanced users open the drawer without leaving the page.
 *
 * Rules of thumb for what goes inside:
 *   - integration/invite snippets (OpenClaw, webhook URLs, device auth toggles)
 *   - import/export, danger-adjacent (but NOT destructive ones — keep those
 *     in a clearly-labelled Danger Zone, not hidden)
 *   - experimental toggles behind a feature flag
 *   - anything prefixed with "Override" or "Custom …" that isn't needed on
 *     first load
 *
 * If a user has to use it in the first 10 minutes, it is not advanced.
 *
 * Controlled vs uncontrolled: pass `open` / `onOpenChange` to persist state
 * across a page (e.g. bind to URL or localStorage). Otherwise omit both and
 * it'll manage its own collapsed/expanded state with `defaultOpen`.
 *
 * Label convention: `<domain> — advanced` (e.g. "Invites — advanced"). Keeping
 * the dash-prefixed `advanced` in the label signals "safe to ignore", which
 * is exactly what we want.
 */
import { ChevronDown } from "lucide-react";
import { ReactNode } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "../lib/utils";

interface AdvancedSectionProps {
  /** Label shown on the trigger row. Prefer `<domain> — advanced`. */
  label: string;
  /** Optional one-liner rendered under the label when collapsed (and also when open). */
  hint?: string;
  /** Section body. Typically one or more setting rows. */
  children: ReactNode;
  /** Controlled open state. If provided, pair with `onOpenChange`. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Uncontrolled default (only used when `open` is undefined). Defaults to closed. */
  defaultOpen?: boolean;
  /** Extra classes applied to the outer wrapper. */
  className?: string;
}

export function AdvancedSection({
  label,
  hint,
  children,
  open,
  onOpenChange,
  defaultOpen = false,
  className,
}: AdvancedSectionProps) {
  return (
    <Collapsible
      open={open}
      defaultOpen={open === undefined ? defaultOpen : undefined}
      onOpenChange={onOpenChange}
      className={cn("space-y-3", className)}
    >
      <CollapsibleTrigger
        className={cn(
          "group flex w-full items-center justify-between gap-3 rounded-md border border-dashed border-border/70 px-4 py-2.5 text-left",
          "transition-colors hover:border-border hover:bg-black/[0.02] dark:hover:bg-white/[0.02]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          {hint && (
            <p className="mt-0.5 text-xs text-muted-foreground/70 truncate">{hint}</p>
          )}
        </div>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-data-[state=open]:rotate-180"
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 overflow-hidden data-[state=closed]:animate-collapse-up data-[state=open]:animate-collapse-down">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
