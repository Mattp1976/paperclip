/**
 * ApprovalPayload — human-readable renderers for the different approval types.
 *
 * Each approval carries a free-form JSON payload produced by the server. The
 * raw JSON is accurate but hostile to read, so these renderers translate the
 * key facts into a plain-language sentence plus a compact set of supporting
 * details. The raw JSON is still available behind the "See full request"
 * toggle on ApprovalDetail for anyone who needs to inspect it.
 */
import type { ReactNode } from "react";
import { UserPlus, Lightbulb, ShieldAlert, ShieldCheck } from "lucide-react";
import { formatCents } from "../lib/utils";

export const typeLabel: Record<string, string> = {
  hire_agent: "Hire Agent",
  approve_ceo_strategy: "CEO Strategy",
  budget_override_required: "Budget Override",
};

/** Build a contextual label for an approval, e.g. "Hire Agent: Designer" */
export function approvalLabel(type: string, payload?: Record<string, unknown> | null): string {
  const base = typeLabel[type] ?? type;
  if (type === "hire_agent" && payload?.name) {
    return `${base}: ${String(payload.name)}`;
  }
  if (type === "budget_override_required" && payload?.scopeName) {
    return `${base}: ${String(payload.scopeName)}`;
  }
  return base;
}

export const typeIcon: Record<string, typeof UserPlus> = {
  hire_agent: UserPlus,
  approve_ceo_strategy: Lightbulb,
  budget_override_required: ShieldAlert,
};

export const defaultTypeIcon = ShieldCheck;

/* -------------------------------------------------------------------------- */
/* Shared pieces                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Summary — the lead sentence at the top of every payload block. Styled to
 * sit comfortably next to the type icon in the card header so the request
 * reads like a sentence, not a form dump.
 */
function Summary({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm leading-relaxed text-foreground">{children}</p>
  );
}

function Emphasis({ children }: { children: ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>;
}

/* -------------------------------------------------------------------------- */
/* Hire agent                                                                 */
/* -------------------------------------------------------------------------- */

function pickString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function pickStringArray(payload: Record<string, unknown>, key: string): string[] {
  const value = payload[key];
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function HireAgentPayload({ payload }: { payload: Record<string, unknown> }) {
  const name = pickString(payload, "name");
  const role = pickString(payload, "role");
  const title = pickString(payload, "title");
  const capabilities = pickString(payload, "capabilities");
  const adapter = pickString(payload, "adapterType");
  const skills = pickStringArray(payload, "desiredSkills");

  // Compose the lead sentence. Fall back gracefully when fields are missing so
  // the summary still reads like prose.
  const whatTheyDo = title ?? role;
  const lead = (() => {
    if (name && whatTheyDo) {
      return (
        <>
          Hire <Emphasis>{name}</Emphasis> as a <Emphasis>{whatTheyDo}</Emphasis>.
        </>
      );
    }
    if (name) return <>Hire <Emphasis>{name}</Emphasis> onto the team.</>;
    if (whatTheyDo) return <>Hire a new <Emphasis>{whatTheyDo}</Emphasis>.</>;
    return <>Hire a new agent onto the team.</>;
  })();

  return (
    <div className="mt-3 space-y-3">
      <Summary>{lead}</Summary>

      {capabilities && (
        <p className="text-sm text-muted-foreground leading-relaxed">{capabilities}</p>
      )}

      {(skills.length > 0 || adapter) && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {skills.map((skill) => (
            <span
              key={skill}
              className="rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 text-muted-foreground"
            >
              {skill}
            </span>
          ))}
          {adapter && (
            <span className="rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
              {adapter}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* CEO strategy                                                               */
/* -------------------------------------------------------------------------- */

export function CeoStrategyPayload({ payload }: { payload: Record<string, unknown> }) {
  const title = pickString(payload, "title");
  const plan =
    pickString(payload, "plan") ??
    pickString(payload, "description") ??
    pickString(payload, "strategy") ??
    pickString(payload, "text");

  return (
    <div className="mt-3 space-y-3">
      <Summary>
        {title ? (
          <>Approve the strategy <Emphasis>"{title}"</Emphasis>? Approving commits the team to the plan below.</>
        ) : (
          <>Approve this strategy? Approving commits the team to the plan below.</>
        )}
      </Summary>

      {plan ? (
        <div className="rounded-lg border border-border/60 bg-muted/30 px-3.5 py-3 text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap max-h-64 overflow-y-auto">
          {plan}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">
          No written plan was attached. Use "See full request" for the raw payload.
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Budget override                                                            */
/* -------------------------------------------------------------------------- */

const METRIC_LABEL: Record<string, string> = {
  billed_cents: "spend",
  tokens_in: "input tokens",
  tokens_out: "output tokens",
  tokens: "tokens",
  runs: "runs",
  tasks: "tasks",
};

const WINDOW_LABEL: Record<string, string> = {
  calendar_month_utc: "this month",
  lifetime: "over its lifetime",
  rolling_24h: "in the last 24 hours",
  rolling_7d: "in the last 7 days",
};

const SCOPE_KIND: Record<string, string> = {
  company: "Company",
  agent: "Agent",
  project: "Project",
  team: "Team",
};

function formatMetricAmount(metric: string | null, amount: number): string {
  if (!metric || metric === "billed_cents") return formatCents(amount);
  return `${amount.toLocaleString()} ${METRIC_LABEL[metric] ?? metric}`;
}

export function BudgetOverridePayload({ payload }: { payload: Record<string, unknown> }) {
  const scopeName = pickString(payload, "scopeName");
  const scopeType = pickString(payload, "scopeType");
  const metric = pickString(payload, "metric");
  const windowKind = pickString(payload, "windowKind");
  const thresholdType = pickString(payload, "thresholdType");
  const budgetAmount = typeof payload.budgetAmount === "number" ? payload.budgetAmount : null;
  const observedAmount = typeof payload.observedAmount === "number" ? payload.observedAmount : null;
  const guidance = pickString(payload, "guidance");

  const scopeKind = scopeType ? (SCOPE_KIND[scopeType] ?? scopeType) : null;
  const scopePhrase = scopeName
    ? scopeKind
      ? `${scopeKind} "${scopeName}"`
      : `"${scopeName}"`
    : scopeKind ?? "This scope";
  const windowPhrase = windowKind ? (WINDOW_LABEL[windowKind] ?? windowKind) : null;
  const metricNoun = metric ? (METRIC_LABEL[metric] ?? metric) : "spend";

  // Core sentence — what happened.
  const hit = thresholdType === "hard";
  const overageClause =
    observedAmount !== null && budgetAmount !== null && budgetAmount > 0
      ? ` (${Math.round(((observedAmount - budgetAmount) / budgetAmount) * 100)}% over)`
      : "";
  const lead = (() => {
    if (observedAmount !== null && budgetAmount !== null) {
      return (
        <>
          <Emphasis>{scopePhrase}</Emphasis> has used{" "}
          <Emphasis>{formatMetricAmount(metric, observedAmount)}</Emphasis> against its{" "}
          <Emphasis>{formatMetricAmount(metric, budgetAmount)}</Emphasis> {metricNoun} limit
          {windowPhrase ? ` ${windowPhrase}` : ""}
          {overageClause}.{" "}
          {hit
            ? "Work is paused until you raise the cap or let the window reset."
            : "Approve to raise the cap, or keep the scope paused."}
        </>
      );
    }
    return (
      <>
        <Emphasis>{scopePhrase}</Emphasis> has hit its {metricNoun} limit
        {windowPhrase ? ` ${windowPhrase}` : ""}.
      </>
    );
  })();

  return (
    <div className="mt-3 space-y-3">
      <Summary>{lead}</Summary>

      {guidance && (
        <p className="text-xs text-muted-foreground leading-relaxed">{guidance}</p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Fallback — any unknown approval type                                       */
/* -------------------------------------------------------------------------- */

/**
 * Some payloads ride on types we haven't explicitly humanised (custom plugins,
 * experimental approval types, etc.). Surface the most likely prose fields
 * and fall back to a quiet "no written description" hint rather than dumping
 * raw JSON — the dedicated toggle on the detail page still exposes it.
 */
function FallbackPayload({ payload }: { payload: Record<string, unknown> }) {
  const summary =
    pickString(payload, "summary") ??
    pickString(payload, "description") ??
    pickString(payload, "message") ??
    pickString(payload, "reason");
  const title = pickString(payload, "title");

  return (
    <div className="mt-3 space-y-2">
      {title && <Summary><Emphasis>{title}</Emphasis></Summary>}
      {summary ? (
        <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
          {summary}
        </p>
      ) : (
        !title && (
          <p className="text-xs text-muted-foreground italic">
            No written description was attached. Use "See full request" for details.
          </p>
        )
      )}
    </div>
  );
}

export function ApprovalPayloadRenderer({ type, payload }: { type: string; payload: Record<string, unknown> }) {
  if (type === "hire_agent") return <HireAgentPayload payload={payload} />;
  if (type === "budget_override_required") return <BudgetOverridePayload payload={payload} />;
  if (type === "approve_ceo_strategy") return <CeoStrategyPayload payload={payload} />;
  return <FallbackPayload payload={payload} />;
}
