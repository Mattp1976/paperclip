/**
 * DecisionTradeOffs — extracts cost, risk, and alternative impact from
 * an approval's payload and renders them in a consistent grid.
 *
 * The payload is domain-specific (Approval.payload is Record<string, unknown>),
 * so we look up a small set of well-known fields and skip what isn't there.
 *
 * Per the brief: never invent figures the system doesn't have.
 */
import { Coins, ShieldAlert, GitBranch } from "lucide-react";
import type { Approval, ApprovalType } from "@orqestra/shared";
import { friendlyCost, cn } from "@/lib/utils";

interface DecisionTradeOffsProps {
  approval: Approval;
}

interface ExtractedTradeOffs {
  costCents: number | null;
  costNote: string | null;
  riskLevel: "low" | "medium" | "high" | "critical" | null;
  riskNote: string | null;
  alternatives: string[];
}

export function DecisionTradeOffs({ approval }: DecisionTradeOffsProps) {
  const t = extractTradeOffs(approval);
  const hasAny =
    t.costCents != null ||
    t.costNote ||
    t.riskLevel ||
    t.riskNote ||
    t.alternatives.length > 0;

  if (!hasAny) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Cell
        icon={Coins}
        label="Cost implication"
        primary={
          t.costCents != null ? friendlyCost(t.costCents / 100) : "Not specified"
        }
        secondary={t.costNote}
      />
      <Cell
        icon={ShieldAlert}
        label="Risk implication"
        primary={t.riskLevel ? labelRisk(t.riskLevel) : "Not specified"}
        secondary={t.riskNote}
        tone={
          t.riskLevel === "high" || t.riskLevel === "critical"
            ? "warn"
            : "default"
        }
      />
      <Cell
        icon={GitBranch}
        label="Alternatives"
        primary={
          t.alternatives.length > 0
            ? `${t.alternatives.length} option${t.alternatives.length === 1 ? "" : "s"}`
            : "None offered"
        }
        secondary={t.alternatives[0] ?? null}
      />
    </div>
  );
}

function Cell({
  icon: Icon,
  label,
  primary,
  secondary,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  primary: string;
  secondary?: string | null;
  tone?: "default" | "warn";
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-3">
      <div className="flex items-center gap-1 mb-1">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      </div>
      <p
        className={cn(
          "text-sm font-semibold",
          tone === "warn"
            ? "text-amber-700 dark:text-amber-300"
            : "text-foreground",
        )}
      >
        {primary}
      </p>
      {secondary ? (
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">
          {secondary}
        </p>
      ) : null}
    </div>
  );
}

function extractTradeOffs(approval: Approval): ExtractedTradeOffs {
  const p = (approval.payload ?? {}) as Record<string, unknown>;
  // Try a sensible set of common payload field names — different
  // approval types use different shapes.
  const costCents = num(
    p.estimatedCostCents ??
      p.costCents ??
      p.budgetImpactCents ??
      p.overspendCents ??
      p.spendCents,
  );
  const costNote = str(
    p.costNote ?? p.budgetImpact ?? p.spendNote,
  );
  const riskLevel = parseRisk(
    p.riskLevel ?? p.risk ?? p.severity,
  );
  const riskNote = str(p.riskNote ?? p.riskRationale);
  const alternatives = arrayOfStrings(
    p.alternatives ?? p.options ?? p.fallbacks,
  );

  // Type-specific augmentation
  if (approval.type === ("budget_override_required" as ApprovalType)) {
    if (riskLevel == null) {
      const overspend = costCents ?? 0;
      // Default risk read for budget overrides — never invent, derive from amount.
      if (overspend > 10000) {
        return {
          costCents,
          costNote,
          riskLevel: "high",
          riskNote: "Spend over the budget threshold",
          alternatives,
        };
      }
    }
  }

  return {
    costCents,
    costNote,
    riskLevel,
    riskNote,
    alternatives,
  };
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

function parseRisk(
  v: unknown,
): "low" | "medium" | "high" | "critical" | null {
  if (typeof v !== "string") return null;
  const lower = v.toLowerCase();
  if (lower === "low" || lower === "medium" || lower === "high" || lower === "critical") {
    return lower;
  }
  return null;
}

function arrayOfStrings(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function labelRisk(level: "low" | "medium" | "high" | "critical"): string {
  switch (level) {
    case "low":
      return "Low";
    case "medium":
      return "Medium";
    case "high":
      return "High";
    case "critical":
      return "Critical";
  }
}
