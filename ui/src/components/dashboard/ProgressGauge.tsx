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
  green: { stroke: "stroke-[#8FA781] dark:stroke-[#A4BD95]", text: "text-sage-ink" },
  amber: { stroke: "stroke-[#D4A860] dark:stroke-[#E6C07F]", text: "text-[#8A6A2E] dark:text-amber-300" },
  red: { stroke: "stroke-[#C47878] dark:stroke-[#D9A5A5]", text: "text-[#8A4A4A] dark:text-[#F0C7C7]" },
  violet: { stroke: "stroke-[#9684B3] dark:stroke-[#B5A5D1]", text: "text-[#6A5A8A] dark:text-violet-300" },
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
    <div
      className={cn(
        "relative flex h-full flex-col rounded-[32px] p-8",
        "bg-white dark:bg-card border border-border/40 dark:border-border/40",
        "shadow-[0_1px_2px_rgba(0,0,0,0.02),0_12px_32px_-12px_rgba(0,0,0,0.06)]",
      )}
    >
      <div>
        <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
          {label}
        </p>
        {caption && (
          <p className="mt-1 text-xs text-muted-foreground/60">{caption}</p>
        )}
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center pt-4">
        <svg
          viewBox="0 0 160 90"
          className="w-full max-w-[240px] overflow-visible"
          role="img"
          aria-label={`${label}: ${clamped}%`}
        >
          {/* Track */}
          <path
            d="M 10 80 A 70 70 0 0 1 150 80"
            className="stroke-muted/50 dark:stroke-muted/25"
            strokeWidth={16}
            strokeLinecap="round"
            fill="none"
          />
          {/* Value arc */}
          <path
            d="M 10 80 A 70 70 0 0 1 150 80"
            className={cn(styles.stroke, "transition-[stroke-dashoffset] duration-700")}
            strokeWidth={16}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${CIRC}`}
            strokeDashoffset={`${CIRC - dash}`}
          />
        </svg>

        <div className="-mt-12 flex flex-col items-center">
          <p className={cn("text-5xl font-semibold tabular-nums tracking-tight leading-none", styles.text)}>
            {Math.round(clamped)}
            <span className="text-2xl font-semibold">%</span>
          </p>
        </div>
      </div>

      {footer && (
        <div className="mt-4 border-t border-border/30 pt-4 text-center text-xs text-muted-foreground/80">
          {footer}
        </div>
      )}
    </div>
  );
}
