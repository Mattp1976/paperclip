/**
 * OutcomeBriefInput — the calm, single-purpose first input the user sees
 * on /start.
 *
 * Renders:
 *   - the primary outcome question
 *   - a single textarea for the brief
 *   - optional starter template chips that prefill the brief
 *   - desired output format selector (kept inline; no advanced settings)
 *
 * Voice rules (ui/VOICE.md): British, sentence case, no trailing periods on
 * one-liners, terse. Say "task" not "issue". Avoid marketing puff.
 */
import {
  ORCHESTRA_TEMPLATES,
  type OrchestraTemplate,
  type OutcomeTargetFormat,
} from "@orqestra/shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRight } from "lucide-react";

const TARGET_FORMAT_LABELS: Record<OutcomeTargetFormat, string> = {
  report: "Report",
  memo: "Memo",
  deck_outline: "Deck outline",
  email: "Email",
  strategy: "Strategy",
  audit: "Audit",
  research_brief: "Research brief",
  custom: "Custom",
};

export interface OutcomeBriefInputValue {
  title: string;
  brief: string;
  targetFormat: OutcomeTargetFormat;
  /** Set if a template prefilled this brief — sent to the planner as metadata. */
  templateId: string | null;
}

interface OutcomeBriefInputProps {
  value: OutcomeBriefInputValue;
  onChange: (next: OutcomeBriefInputValue) => void;
  /** Disable inputs while the parent is mid-submit. */
  disabled?: boolean;
}

export function OutcomeBriefInput({
  value,
  onChange,
  disabled,
}: OutcomeBriefInputProps) {
  const set = <K extends keyof OutcomeBriefInputValue>(
    key: K,
    next: OutcomeBriefInputValue[K],
  ) => onChange({ ...value, [key]: next });

  const applyTemplate = (template: OrchestraTemplate) => {
    onChange({
      title: template.defaultTitle,
      brief: template.defaultBrief,
      targetFormat: template.defaultTargetFormat,
      templateId: template.id,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          What outcome do you want?
        </h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          Describe the result. Orqestra will shape the team, plan the work,
          and ask before anything important runs
        </p>
      </div>

      <div className="space-y-3">
        <label className="block">
          <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
            Outcome
          </span>
          <input
            type="text"
            value={value.title}
            disabled={disabled}
            onChange={(e) => set("title", e.target.value)}
            placeholder="e.g. Strategic market intelligence report on the UK fintech space"
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
          />
        </label>

        <label className="block">
          <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
            Add context
          </span>
          <textarea
            value={value.brief}
            disabled={disabled}
            onChange={(e) => set("brief", e.target.value)}
            rows={6}
            placeholder="What you want, who it's for, and any constraints. The more specific the brief, the better the plan."
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
          />
        </label>

        <label className="block max-w-xs">
          <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
            Desired output format
          </span>
          <Select
            value={value.targetFormat}
            onValueChange={(v) =>
              set("targetFormat", v as OutcomeTargetFormat)
            }
            disabled={disabled}
          >
            <SelectTrigger className="rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(
                Object.keys(TARGET_FORMAT_LABELS) as OutcomeTargetFormat[]
              ).map((k) => (
                <SelectItem key={k} value={k}>
                  {TARGET_FORMAT_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
          Or start from a template
        </p>
        <div className="flex flex-wrap gap-2">
          {ORCHESTRA_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={disabled}
              onClick={() => applyTemplate(t)}
              className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground/90 transition-colors hover:bg-muted/60 disabled:opacity-60"
              title={t.description}
            >
              {t.icon ? (
                <span className="text-base leading-none">{t.icon}</span>
              ) : null}
              <span>{t.name}</span>
              <ArrowRight className="h-3 w-3 text-muted-foreground/60 group-hover:text-foreground/80" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

