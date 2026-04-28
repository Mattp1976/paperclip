/**
 * ApprovalRecommendation — deterministic, transparent recommendation
 * shown alongside a decision card.
 *
 * Sprint 5 v1: rules-based, never invents data. Surfaces:
 *   - "Recommended: approve" — low risk, modest cost
 *   - "Recommended: reject" — high risk or large overspend
 *   - "No recommendation" — not enough info to call it
 *
 * The user always decides. We're showing our working, not deciding for them.
 */
import { ThumbsUp, ThumbsDown, HelpCircle } from "lucide-react";
import type { Approval } from "@orqestra/shared";
import { cn } from "@/lib/utils";

interface ApprovalRecommendationProps {
  approval: Approval;
}

type Recommendation = "approve" | "reject" | "none";

interface RecommendationResult {
  recommendation: Recommendation;
  why: string;
}

export function ApprovalRecommendation({
  approval,
}: ApprovalRecommendationProps) {
  const r = computeRecommendation(approval);
  return <Pill result={r} />;
}

function Pill({ result }: { result: RecommendationResult }) {
  const Icon =
    result.recommendation === "approve"
      ? ThumbsUp
      : result.recommendation === "reject"
        ? ThumbsDown
        : HelpCircle;
  const tone =
    result.recommendation === "approve"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50"
      : result.recommendation === "reject"
        ? "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50"
        : "bg-muted text-muted-foreground border-border";
  const label =
    result.recommendation === "approve"
      ? "Recommended: approve"
      : result.recommendation === "reject"
        ? "Recommended: reject"
        : "No recommendation";
  return (
    <div
      className={cn(
        "inline-flex items-start gap-2 rounded-xl border px-3 py-2 text-xs",
        tone,
      )}
    >
      <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="font-medium">{label}</p>
        <p className="opacity-80 mt-0.5 leading-snug">{result.why}</p>
      </div>
    </div>
  );
}

function computeRecommendation(approval: Approval): RecommendationResult {
  const p = (approval.payload ?? {}) as Record<string, unknown>;
  const costCents = numField(
    p.estimatedCostCents ??
      p.costCents ??
      p.budgetImpactCents ??
      p.overspendCents,
  );
  const risk = riskField(p.riskLevel ?? p.risk ?? p.severity);

  // Hard-no rules first.
  if (risk === "critical") {
    return {
      recommendation: "reject",
      why: "Risk is critical. Recommend a senior look before proceeding",
    };
  }
  if (costCents != null && costCents > 100_00) {
    return {
      recommendation: "reject",
      why: "Cost is above £100. Worth a closer look before approving",
    };
  }

  // Soft-yes rules.
  if (risk === "low" && (costCents == null || costCents < 20_00)) {
    return {
      recommendation: "approve",
      why: "Low risk and modest cost. Safe to approve",
    };
  }
  if (
    approval.type === "approve_ceo_strategy" &&
    risk !== "high"
  ) {
    return {
      recommendation: "approve",
      why: "Strategy review with no flagged risks. Worth approving so the team can act",
    };
  }

  // Default: don't pretend we know.
  return {
    recommendation: "none",
    why: "Not enough signal to recommend either way. Read the full request and decide",
  };
}

function numField(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function riskField(
  v: unknown,
): "low" | "medium" | "high" | "critical" | null {
  if (typeof v !== "string") return null;
  const lower = v.toLowerCase();
  if (
    lower === "low" ||
    lower === "medium" ||
    lower === "high" ||
    lower === "critical"
  )
    return lower;
  return null;
}
