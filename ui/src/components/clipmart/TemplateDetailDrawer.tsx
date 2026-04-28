/**
 * TemplateDetailDrawer — slide-in drawer with the full read on a
 * Clipmart template before the user installs.
 *
 * Sections: tagline, description, who it's best for, the team
 * (each agent with role + title + capabilities), starter projects,
 * starter outcomes, install CTA.
 *
 * Lightweight implementation — uses a fixed-position panel rather than
 * a Radix Dialog so we don't need to wire focus management here. The
 * parent controls open/close via the prop.
 */
import { X, Users, Sparkles, FolderKanban, Clock } from "lucide-react";
import type { FleetTemplateListItem } from "@/api/fleetTemplates";
import { StarterOutcomesList } from "./StarterOutcomesList";
import { InstallCompanyButton } from "./InstallCompanyButton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TemplateDetailDrawerProps {
  template: FleetTemplateListItem | null;
  open: boolean;
  onClose: () => void;
  installing: boolean;
  installed: boolean;
  onInstall: () => void;
  onPickStarterOutcome?: (
    outcome: FleetTemplateListItem["starterOutcomes"][number],
  ) => void;
}

export function TemplateDetailDrawer({
  template,
  open,
  onClose,
  installing,
  installed,
  onInstall,
  onPickStarterOutcome,
}: TemplateDetailDrawerProps) {
  if (!template) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-label={`${template.name} details`}
        className={cn(
          "fixed inset-y-0 right-0 z-50 w-full max-w-xl border-l border-border bg-card shadow-xl transition-transform duration-200 flex flex-col",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-border/60 flex items-start gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Clipmart
            </p>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              {template.name}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {template.tagline}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="shrink-0"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Scroll body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Description */}
          <p className="text-sm text-foreground/85 leading-relaxed">
            {template.description}
          </p>

          {/* Quick meta */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <Meta
              icon={Users}
              label="Team size"
              value={`${template.agentCount} agent${template.agentCount === 1 ? "" : "s"}`}
            />
            <Meta
              icon={Clock}
              label="Setup time"
              value={`~${template.estimatedSetupMinutes} min`}
            />
            <Meta
              icon={FolderKanban}
              label="Starter projects"
              value={`${template.projectCount}`}
            />
            <Meta
              icon={Sparkles}
              label="Starter outcomes"
              value={`${template.starterOutcomeCount}`}
            />
          </div>

          {/* Best for */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
              Best for
            </p>
            <p className="text-sm text-foreground/85 leading-relaxed">
              {template.bestFor}
            </p>
          </div>

          {/* Team */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
              The team
            </p>
            <ul className="space-y-3">
              {template.agents.map((a) => (
                <li
                  key={a.slug}
                  className="rounded-xl border border-border/60 bg-background/60 p-3"
                >
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className="text-sm font-medium text-foreground">
                      {a.name}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {a.title || a.role}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                    {a.capabilities}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          {/* Starter outcomes */}
          <StarterOutcomesList
            outcomes={template.starterOutcomes}
            onPick={onPickStarterOutcome}
          />
        </div>

        {/* Footer CTA */}
        <div className="border-t border-border/60 px-6 py-4 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Nothing runs and no money is spent until you ask
          </p>
          <InstallCompanyButton
            installing={installing}
            installed={installed}
            onInstall={onInstall}
          />
        </div>
      </aside>
    </>
  );
}

function Meta({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-2.5">
      <div className="flex items-center gap-1 mb-0.5">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      </div>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}
