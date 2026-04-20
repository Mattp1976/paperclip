/**
 * ProgressGauge — semicircular (half-donut) progress gauge.
 *
 * Inspired by the "Project Progress" gauge in the reference design. Pure SVG,
 * no external dep. Accepts a 0–100 value plus a label/caption and optional
 * comparison stat beneath.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ProgressGaugeProps {
  /** 0–100 */
  value: number;
  label: string;
  caption?: string;
  /** A short KPI string rendered beneath the gauge */
  footer?: ReactNode;
  /** Tone of the arc (green by default, amber/red for warning states) */
  tone?: "green" | "amber" | "red" | "violet";
}

const toneStyles: Record<NonNullable<ProgressGaugeProps["tone"]>, { stroke: string; text: string }> = {
  green: { stroke: "stroke-green-600 dark:stroke-green-500", text: "text-green-700 dark:text-green-400" },
  amber: { stroke: "stroke-amber-500", text: "text-amber-600 dark:text-amber-400" },
  red: { stroke: "stroke-red-500", text: "text-red-600 dark:text-red-400" },
  violet: { stroke: "stroke-violet-500", text: "text-violet-600 dark:text-violet-400" },
};

export function ProgressGauge({
  value,
  label,
  caption,
  footer,
  tone = "green",
}: ProgressGaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  // Semicircle arc math: radius 70, circumference of a half-circle = π * r = ~219.9
  const R = 70;
  const CIRC = Math.PI * R;
  const dash = (clamped / 100) * CIRC;
  const styles = toneStyles[tone];

  return (
    <div className="relative flex h-full flex-col rounded-3xl bg-white dark:bg-card border border-border/50 dark:border-border/40 shadow-sm shadow-black/[0.03] p-6">
      <div>
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground/70">
          {label}
        </p>
        {caption && (
          <p className="mt-0.5 text-xs text-muted-foreground/60">{caption}</p>
        )}
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center pt-2">
        <svg
          viewBox="0 0 160 90"
          className="w-full max-w-[220px] overflow-visible"
          role="img"
          aria-label={`${label}: ${clamped}%`}
        >
          {/* Track */}
          <path
            d="M 10 80 A 70 70 0 0 1 150 80"
            className="stroke-muted/60 dark:stroke-muted/30"
            strokeWidth={14}
            strokeLinecap="round"
            fill="none"
          />
          {/* Value arc */}
          <path
            d="M 10 80 A 70 70 0 0 1 150 80"
            className={cn(styles.stroke, "transition-[stroke-dashoffset] duration-700")}
            strokeWidth={14}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${CIRC}`}
            strokeDashoffset={`${CIRC - dash}`}
          />
        </svg>

        <div className="-mt-10 flex flex-col items-center">
          <p className={cn("text-4xl font-bold tabular-nums tracking-tight", styles.text)}>
            {Math.round(clamped)}
            <span className="text-xl font-semibold">%</span>
          </p>
        </div>
      </div>

      {footer && (
        <div className="mt-3 border-t border-border/30 pt-3 text-center text-xs text-muted-foreground/80">
          {footer}
        </div>
      )}
    </div>
  );
}
