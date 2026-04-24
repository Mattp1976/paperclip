/**
 * FleetTemplates — sibling to CompanyTemplates.
 *
 * CompanyTemplates creates a new company wholesale. FleetTemplates installs
 * a pre-wired TEAM into the company the user is currently in. That means no
 * company creation step, no company-name customisation — just pick a team,
 * preview it, and hit "Install into <Company>".
 *
 * Icons are delivered from the server as string names; we resolve a small
 * palette of lucide icons below.
 */
import { useState } from "react";
import { useNavigate } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fleetTemplatesApi, type FleetTemplateListItem } from "../api/fleetTemplates";
import { useCompany } from "../context/CompanyContext";
import { useToast } from "../context/ToastContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Palette,
  Briefcase,
  Rocket,
  Code2,
  Megaphone,
  Building2,
  User,
  Sparkles,
  Loader2,
  Check,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  Palette,
  Briefcase,
  Rocket,
  Code2,
  Megaphone,
  Building2,
  User,
};

function resolveIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? Sparkles;
}

/* ── Template card ────────────────────────────────────────────── */

function TemplateCard({
  template,
  selected,
  onSelect,
}: {
  template: FleetTemplateListItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = resolveIcon(template.icon);
  return (
    <button
      onClick={onSelect}
      className={cn(
        "relative flex flex-col gap-3 rounded-lg border p-4 text-left transition-all hover:shadow-md",
        selected
          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
          : "border-border hover:border-primary/30",
      )}
    >
      {selected && (
        <div className="absolute top-3 right-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="h-3 w-3" />
        </div>
      )}
      <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", template.bgColor)}>
        <Icon className={cn("h-5 w-5", template.color)} />
      </div>
      <div>
        <h3 className="text-sm font-semibold">{template.name}</h3>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{template.tagline}</p>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-auto pt-1">
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {template.agentCount} agents
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {template.projectCount} projects
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {template.starterTaskCount} starter tasks
        </span>
      </div>
    </button>
  );
}

/* ── Preview + install ────────────────────────────────────────── */

function TemplatePreview({
  template,
  companyName,
  installing,
  onBack,
  onInstall,
}: {
  template: FleetTemplateListItem;
  companyName: string;
  installing: boolean;
  onBack: () => void;
  onInstall: () => void;
}) {
  const Icon = resolveIcon(template.icon);
  return (
    <div className="mx-auto max-w-2xl py-6">
      <button
        onClick={onBack}
        className="text-xs text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1"
      >
        ← Back to starter teams
      </button>

      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", template.bgColor)}>
            <Icon className={cn("h-5 w-5", template.color)} />
          </div>
          <div>
            <h2 className="text-lg font-semibold">{template.name}</h2>
            <p className="text-xs text-muted-foreground">{template.tagline}</p>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground mb-3">{template.description}</p>
        <p className="text-xs text-muted-foreground/80 mb-5">
          <span className="font-medium text-foreground">Best for:</span> {template.bestFor}
        </p>

        <div className="space-y-5">
          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-2">
              Team ({template.agents.length} agents)
            </h3>
            <div className="space-y-1.5">
              {template.agents.map((agent) => (
                <div key={agent.slug} className="flex items-start gap-2 rounded-md bg-muted/30 px-3 py-2">
                  <Sparkles className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{agent.name}</span>
                      <span className="text-xs text-muted-foreground">{agent.title}</span>
                      <span
                        className={cn(
                          "ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                          agent.role === "ceo"
                            ? "bg-amber-500/10 text-amber-600"
                            : agent.role === "manager"
                              ? "bg-blue-500/10 text-blue-600"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {agent.role}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {agent.capabilities}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-2">
              Projects ({template.projects.length})
            </h3>
            <div className="space-y-1.5">
              {template.projects.map((proj) => (
                <div key={proj.name} className="flex items-center gap-2 rounded-md bg-muted/30 px-3 py-2">
                  <span className="text-sm">{proj.name}</span>
                  <span className="text-xs text-muted-foreground truncate">{proj.description}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-2">
              Starter tasks ({template.starterTasks.length})
            </h3>
            <div className="space-y-1.5">
              {template.starterTasks.map((task) => (
                <div key={task.title} className="flex items-center gap-2 rounded-md bg-muted/30 px-3 py-2">
                  <span className="text-sm truncate">{task.title}</span>
                  <span
                    className={cn(
                      "ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                      task.priority === "urgent"
                        ? "bg-red-500/10 text-red-600"
                        : task.priority === "high"
                          ? "bg-orange-500/10 text-orange-600"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {task.priority}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {template.routines.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground mb-2">
                Suggested routines ({template.routines.length})
                <span className="ml-2 text-[10px] font-normal text-muted-foreground/60">
                  Preview only — not installed in v0.1
                </span>
              </h3>
              <div className="space-y-1.5">
                {template.routines.map((r) => (
                  <div
                    key={r.title}
                    className="flex items-center gap-2 rounded-md bg-muted/20 px-3 py-2 text-muted-foreground"
                  >
                    <span className="text-sm truncate">{r.title}</span>
                    <span className="ml-auto shrink-0 text-[10px]">{r.cadence}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Installs into <span className="font-medium text-foreground">{companyName}</span>.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onBack} disabled={installing}>
              Back
            </Button>
            <Button onClick={onInstall} disabled={installing} className="gap-1.5">
              {installing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
              Install team
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────── */

export function FleetTemplates() {
  const [selected, setSelected] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const { selectedCompany } = useCompany();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const navigate = useNavigate();

  const templatesQ = useQuery({
    queryKey: ["fleet-templates"],
    queryFn: () => fleetTemplatesApi.list(),
  });

  const template = templatesQ.data?.find((t) => t.id === selected) ?? null;

  const installMut = useMutation({
    mutationFn: async () => {
      if (!selectedCompany) throw new Error("Select a company first");
      if (!template) throw new Error("Select a template");
      setInstalling(true);
      return fleetTemplatesApi.install(selectedCompany.id, template.id);
    },
    onSuccess: async (result) => {
      setInstalling(false);
      // Invalidate everything that could have changed — agents, projects, issues,
      // dashboard counts. Broad invalidation is fine for a one-off install action.
      queryClient.invalidateQueries();
      pushToast({
        title: "Team installed",
        body: `${result.agents.length} agents, ${result.projects.length} projects, ${result.starterTasks.length} tasks added.`,
      });
      setSelected(null);
      if (selectedCompany?.issuePrefix) {
        navigate(`/${selectedCompany.issuePrefix}/agents/all`);
      }
    },
    onError: (err) => {
      setInstalling(false);
      pushToast({
        title: "Install failed",
        body: err instanceof Error ? err.message : "Unknown error",
        tone: "error",
      });
    },
  });

  if (!selectedCompany) {
    return (
      <div className="py-6">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Starter teams</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Drop a pre-wired team into one of your companies. Pick a company first.
          </p>
        </div>
        <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
          Select a company from the sidebar to browse starter teams.
        </div>
      </div>
    );
  }

  if (template) {
    return (
      <TemplatePreview
        template={template}
        companyName={selectedCompany.name}
        installing={installing || installMut.isPending}
        onBack={() => setSelected(null)}
        onInstall={() => installMut.mutate()}
      />
    );
  }

  return (
    <div className="py-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Starter teams</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pre-wired teams you can install into <span className="font-medium text-foreground">{selectedCompany.name}</span>.
          Each brings its own agents, projects, and starter tasks.
        </p>
      </div>

      {templatesQ.isLoading && (
        <div className="py-20 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {templatesQ.error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load starter teams:{" "}
          {templatesQ.error instanceof Error ? templatesQ.error.message : "unknown error"}
        </div>
      )}

      {templatesQ.data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templatesQ.data.map((tpl) => (
            <TemplateCard
              key={tpl.id}
              template={tpl}
              selected={selected === tpl.id}
              onSelect={() => setSelected(tpl.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
