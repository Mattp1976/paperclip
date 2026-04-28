/**
 * CompanyTemplateCard — one card in the Clipmart catalogue.
 *
 * Shows: name, plain-English purpose, team size, typical outcomes,
 * estimated setup time, required adapters, install button.
 *
 * Per the brief, this is the unit a user evaluates when choosing a
 * pre-built company. Keep it scannable. The detail drawer carries the
 * deeper read.
 */
import { Users, Clock, Sparkles, Plug, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SoftCard } from "@/components/SoftCard";
import { cn } from "@/lib/utils";
import type { FleetTemplateListItem } from "@/api/fleetTemplates";

interface CompanyTemplateCardProps {
  template: FleetTemplateListItem;
  /** Open the detail drawer. */
  onOpen: () => void;
  /** One-tap install. */
  onInstall: () => void;
  installing?: boolean;
}

export function CompanyTemplateCard({
  template,
  onOpen,
  onInstall,
  installing,
}: CompanyTemplateCardProps) {
  return (
    <SoftCard className="p-5 flex flex-col gap-4 h-full">
      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <h3 className="text-base font-semibold text-foreground leading-tight">
            {template.name}
          </h3>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
          {template.tagline}
        </p>
      </div>

      <Meta template={template} />

      {template.starterOutcomes.length > 0 ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
            Typical outcomes
          </p>
          <ul className="space-y-1">
            {template.starterOutcomes.slice(0, 3).map((o, i) => (
              <li
                key={i}
                className="text-xs text-foreground/85 leading-relaxed flex gap-1.5"
              >
                <Sparkles className="h-3 w-3 text-muted-foreground/70 shrink-0 mt-0.5" />
                <span>{o.title}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-auto flex items-center gap-2 pt-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onOpen}
          className="gap-1 text-xs"
        >
          See team
          <ArrowRight className="h-3 w-3" />
        </Button>
        <Button
          variant="sage"
          size="sm"
          onClick={onInstall}
          disabled={installing}
          className="ml-auto gap-1.5"
        >
          {installing ? "Installing…" : "Install company"}
        </Button>
      </div>
    </SoftCard>
  );
}

function Meta({ template }: { template: FleetTemplateListItem }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <Users className="h-3 w-3" />
        <span className="text-foreground/85 font-medium">
          {template.agentCount}
        </span>
        {" "}agent{template.agentCount === 1 ? "" : "s"}
      </span>
      <span className="inline-flex items-center gap-1">
        <Clock className="h-3 w-3" />
        ~{template.estimatedSetupMinutes} min to install
      </span>
      {template.requiredAdapters.length > 0 ? (
        <span className="inline-flex items-center gap-1" title="Adapter runtimes used by these agents">
          <Plug className="h-3 w-3" />
          <span className={cn("text-foreground/75")}>
            {template.requiredAdapters.map(prettyAdapter).join(" · ")}
          </span>
        </span>
      ) : null}
    </div>
  );
}

function prettyAdapter(adapterType: string): string {
  return adapterType
    .replace(/_local$/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
