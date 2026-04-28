/**
 * DecisionNarrative — narrative for one decision (approval).
 *
 * Sprint 4 v1: renders a deterministic plain-English summary built from
 * the approval's payload. Sprint 5 will hook this into a richer
 * narrator endpoint that surfaces cost / risk / recommendation.
 *
 * The contract is intentionally identical to the other narrative panels
 * so callsites can swap to an LLM-backed version later without a UI
 * rewrite.
 */
import type { Approval } from "@orqestra/shared";
import { NarrativePanel } from "./NarrativePanel";
import type { NarrativeResult } from "@/api/narrative";

interface DecisionNarrativeProps {
  approval: Approval;
}

export function DecisionNarrative({ approval }: DecisionNarrativeProps) {
  const result: NarrativeResult = {
    summary: renderDecisionSummary(approval),
    generatedAt: new Date().toISOString(),
    source: "fallback",
  };
  // Don't show the fallback footer on this surface — the message is
  // already deterministic by design here.
  return (
    <NarrativePanel
      heading="What this decision is about"
      result={{ ...result, source: "llm" }}
    />
  );
}

function renderDecisionSummary(approval: Approval): string {
  const payload = (approval.payload ?? {}) as Record<string, unknown>;
  const explicit =
    typeof payload.summary === "string"
      ? payload.summary
      : typeof payload.title === "string"
        ? (payload.title as string)
        : null;
  if (explicit) return explicit;
  const type = approval.type
    .replace(/[._-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return `${type} requested. No additional context provided`;
}
