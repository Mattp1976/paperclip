import { useState } from "react";
import { useNavigate } from "@/lib/router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { companiesApi } from "../api/companies";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { issuesApi } from "../api/issues";
import { useCompany } from "../context/CompanyContext";
import { useToast } from "../context/ToastContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Rocket,
  Briefcase,
  Building2,
  Code2,
  Palette,
  Megaphone,
  Loader2,
  Check,
  ArrowRight,
  Sparkles,
} from "lucide-react";

/* ── Template definitions ─────────────────────────────────────── */

interface AgentTemplate {
  name: string;
  role: "ceo" | "manager" | "specialist";
  title: string;
  capabilities: string;
  adapterType: string;
}

interface ProjectTemplate {
  name: string;
  description: string;
}

interface StarterIssue {
  title: string;
  description: string;
  priority: "urgent" | "high" | "medium" | "low";
}

interface CompanyTemplate {
  id: string;
  name: string;
  description: string;
  icon: typeof Rocket;
  color: string;
  bgColor: string;
  companyName: string;
  companyDescription: string;
  budgetMonthlyCents: number;
  agents: AgentTemplate[];
  projects: ProjectTemplate[];
  starterIssues: StarterIssue[];
}

const TEMPLATES: CompanyTemplate[] = [
  {
    id: "startup",
    name: "AI Startup",
    description: "A lean startup team with a CEO, engineer, and product manager. Ships fast with minimal overhead.",
    icon: Rocket,
    color: "text-violet-500",
    bgColor: "bg-violet-500/10",
    companyName: "My Startup",
    companyDescription: "An AI-powered startup focused on rapid iteration and product-market fit.",
    budgetMonthlyCents: 50_00,
    agents: [
      { name: "Alex", role: "ceo", title: "CEO & Strategist", capabilities: "Strategy, planning, delegation", adapterType: "claude_code" },
      { name: "Jordan", role: "specialist", title: "Lead Engineer", capabilities: "Full-stack engineering, code review, architecture", adapterType: "claude_code" },
      { name: "Casey", role: "specialist", title: "Product Manager", capabilities: "User research, specs, prioritisation", adapterType: "claude_code" },
    ],
    projects: [
      { name: "MVP", description: "Core product features for initial launch" },
      { name: "Growth", description: "User acquisition and retention experiments" },
    ],
    starterIssues: [
      { title: "Draft product vision and 90-day roadmap", description: "Create a high-level strategic document outlining the product vision, target market, and key milestones for the first 90 days.", priority: "high" },
      { title: "Set up development environment and CI/CD", description: "Configure the development toolchain, repository structure, and continuous integration pipeline.", priority: "high" },
      { title: "Create user persona profiles", description: "Research and document 3-5 user personas with their pain points, goals, and behaviors.", priority: "medium" },
    ],
  },
  {
    id: "agency",
    name: "Creative Agency",
    description: "A multi-disciplinary agency with design, content, and strategy capabilities. Handles client work end-to-end.",
    icon: Palette,
    color: "text-pink-500",
    bgColor: "bg-pink-500/10",
    companyName: "My Agency",
    companyDescription: "A creative agency delivering brand strategy, design, and content for clients.",
    budgetMonthlyCents: 75_00,
    agents: [
      { name: "Morgan", role: "ceo", title: "Creative Director", capabilities: "Creative strategy, brand direction, team coordination", adapterType: "claude_code" },
      { name: "Riley", role: "specialist", title: "Senior Designer", capabilities: "Visual design, UI/UX, brand identity", adapterType: "claude_code" },
      { name: "Taylor", role: "specialist", title: "Content Strategist", capabilities: "Copywriting, content planning, editorial", adapterType: "claude_code" },
      { name: "Avery", role: "specialist", title: "Account Manager", capabilities: "Client communication, project coordination, timelines", adapterType: "claude_code" },
    ],
    projects: [
      { name: "Client Onboarding", description: "Processes for onboarding new clients" },
      { name: "Brand Templates", description: "Reusable brand assets and templates" },
    ],
    starterIssues: [
      { title: "Build client intake questionnaire", description: "Design a comprehensive questionnaire to capture new client brand requirements, goals, and existing assets.", priority: "high" },
      { title: "Create brand guidelines template", description: "Build a reusable template for brand guidelines documentation including typography, colour palette, and voice.", priority: "medium" },
    ],
  },
  {
    id: "dev-team",
    name: "Engineering Team",
    description: "A structured engineering team with a tech lead, backend and frontend engineers, and a QA specialist.",
    icon: Code2,
    color: "text-sage-ink",
    bgColor: "bg-primary/10",
    companyName: "Engineering Squad",
    companyDescription: "A focused engineering team building and maintaining software products.",
    budgetMonthlyCents: 100_00,
    agents: [
      { name: "Sam", role: "ceo", title: "Tech Lead", capabilities: "Architecture, code review, technical decisions, sprint planning", adapterType: "claude_code" },
      { name: "Blake", role: "specialist", title: "Backend Engineer", capabilities: "API design, database, server-side logic", adapterType: "claude_code" },
      { name: "Quinn", role: "specialist", title: "Frontend Engineer", capabilities: "React, UI components, responsive design, accessibility", adapterType: "claude_code" },
      { name: "Drew", role: "specialist", title: "QA Engineer", capabilities: "Test automation, bug triage, quality assurance", adapterType: "claude_code" },
    ],
    projects: [
      { name: "Platform", description: "Core platform development and infrastructure" },
      { name: "Technical Debt", description: "Refactoring, performance, and code quality improvements" },
    ],
    starterIssues: [
      { title: "Audit existing codebase and create tech debt backlog", description: "Review the current codebase for code quality, test coverage, and architectural issues. Create a prioritised backlog.", priority: "high" },
      { title: "Set up automated test pipeline", description: "Configure CI to run unit, integration, and end-to-end tests on every pull request.", priority: "high" },
      { title: "Document API contracts", description: "Create OpenAPI specifications for all API endpoints with request/response schemas.", priority: "medium" },
    ],
  },
  {
    id: "marketing",
    name: "Marketing Team",
    description: "A growth-focused marketing team handling content, SEO, social, and analytics.",
    icon: Megaphone,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    companyName: "Marketing Team",
    companyDescription: "A results-driven marketing team focused on growth, content, and brand awareness.",
    budgetMonthlyCents: 60_00,
    agents: [
      { name: "Jamie", role: "ceo", title: "Head of Marketing", capabilities: "Strategy, campaign planning, budget allocation, team coordination", adapterType: "claude_code" },
      { name: "Reese", role: "specialist", title: "Content Writer", capabilities: "Blog posts, case studies, whitepapers, email copy", adapterType: "claude_code" },
      { name: "Parker", role: "specialist", title: "SEO Specialist", capabilities: "Keyword research, on-page SEO, link building, analytics", adapterType: "claude_code" },
    ],
    projects: [
      { name: "Content Calendar", description: "Quarterly content planning and production" },
      { name: "SEO & Analytics", description: "Search optimisation and performance tracking" },
    ],
    starterIssues: [
      { title: "Build quarterly content calendar", description: "Plan content topics, formats, and publishing schedule for the next quarter. Align with product roadmap and seasonal events.", priority: "high" },
      { title: "Run baseline SEO audit", description: "Analyse current search rankings, identify keyword opportunities, and document technical SEO issues.", priority: "medium" },
    ],
  },
  {
    id: "consulting",
    name: "Consulting Firm",
    description: "A consulting firm structure with a managing partner, analysts, and engagement managers.",
    icon: Briefcase,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    companyName: "My Consultancy",
    companyDescription: "A strategic consulting firm providing research, analysis, and advisory services.",
    budgetMonthlyCents: 80_00,
    agents: [
      { name: "Ellis", role: "ceo", title: "Managing Partner", capabilities: "Client strategy, engagement oversight, business development", adapterType: "claude_code" },
      { name: "Finley", role: "manager", title: "Engagement Manager", capabilities: "Project management, client delivery, team coordination", adapterType: "claude_code" },
      { name: "Rowan", role: "specialist", title: "Senior Analyst", capabilities: "Research, data analysis, financial modelling, presentations", adapterType: "claude_code" },
      { name: "Sage", role: "specialist", title: "Associate", capabilities: "Research, documentation, slide creation, meeting notes", adapterType: "claude_code" },
    ],
    projects: [
      { name: "Methodology", description: "Standard frameworks and templates" },
      { name: "Knowledge Base", description: "Reusable research and case studies" },
    ],
    starterIssues: [
      { title: "Create engagement kickoff template", description: "Build a standard template for kicking off new client engagements including stakeholder mapping, scope definition, and timeline.", priority: "high" },
      { title: "Build deliverable review checklist", description: "Define quality standards and review criteria for all client-facing deliverables.", priority: "medium" },
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise IT",
    description: "An enterprise team with governance, security focus, and structured approval workflows.",
    icon: Building2,
    color: "text-slate-500",
    bgColor: "bg-slate-500/10",
    companyName: "Enterprise IT",
    companyDescription: "An enterprise IT department with governance controls, security policies, and structured workflows.",
    budgetMonthlyCents: 150_00,
    agents: [
      { name: "Cameron", role: "ceo", title: "IT Director", capabilities: "IT strategy, vendor management, budget oversight, governance", adapterType: "claude_code" },
      { name: "Hayden", role: "manager", title: "Security Lead", capabilities: "Security policy, compliance, vulnerability assessment, access control", adapterType: "claude_code" },
      { name: "Charlie", role: "specialist", title: "Systems Engineer", capabilities: "Infrastructure, automation, monitoring, incident response", adapterType: "claude_code" },
      { name: "Emery", role: "specialist", title: "Business Analyst", capabilities: "Requirements gathering, process mapping, stakeholder communication", adapterType: "claude_code" },
    ],
    projects: [
      { name: "Security & Compliance", description: "Security policies, audits, and compliance tracking" },
      { name: "Infrastructure", description: "Platform infrastructure and automation" },
    ],
    starterIssues: [
      { title: "Conduct security policy review", description: "Review and update all security policies. Identify gaps in coverage and compliance requirements.", priority: "urgent" },
      { title: "Create infrastructure runbook", description: "Document standard operating procedures for infrastructure management, including incident response and escalation paths.", priority: "high" },
    ],
  },
];

/* ── Template Card ────────────────────────────────────────────── */

function TemplateCard({
  template,
  selected,
  onSelect,
}: {
  template: CompanyTemplate;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = template.icon;

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
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{template.description}</p>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-auto pt-1">
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {template.agents.length} agents
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {template.projects.length} projects
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {template.starterIssues.length} starter tasks
        </span>
      </div>
    </button>
  );
}

/* ── Main CompanyTemplates component ──────────────────────────── */

export function CompanyTemplates() {
  const [selected, setSelected] = useState<string | null>(null);
  const [step, setStep] = useState<"choose" | "customize" | "creating">("choose");
  const [companyName, setCompanyName] = useState("");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const { reloadCompanies } = useCompany();

  const template = TEMPLATES.find((t) => t.id === selected) ?? null;

  const createMut = useMutation({
    mutationFn: async () => {
      if (!template) throw new Error("No template selected");
      setStep("creating");

      const finalName = companyName.trim() || template.companyName;

      // 1. Create the company
      const company = await companiesApi.create({
        name: finalName,
        description: template.companyDescription,
        budgetMonthlyCents: template.budgetMonthlyCents,
      });

      // 2. Create agents
      const createdAgents: Array<{ id: string; name: string }> = [];
      for (const agentTpl of template.agents) {
        const agent = await agentsApi.create(company.id, {
          name: agentTpl.name,
          role: agentTpl.role,
          title: agentTpl.title,
          capabilities: agentTpl.capabilities,
          adapterType: agentTpl.adapterType,
          reportsTo: agentTpl.role !== "ceo" && createdAgents.length > 0 ? createdAgents[0]!.id : null,
        });
        createdAgents.push({ id: agent.id, name: agent.name });
      }

      // 3. Create projects
      for (const projTpl of template.projects) {
        await projectsApi.create(company.id, {
          name: projTpl.name,
          description: projTpl.description,
        });
      }

      // 4. Create starter issues (assigned to CEO agent)
      const ceoAgent = createdAgents[0];
      for (const issueTpl of template.starterIssues) {
        await issuesApi.create(company.id, {
          title: issueTpl.title,
          description: issueTpl.description,
          priority: issueTpl.priority,
          status: "todo",
          assigneeAgentId: ceoAgent?.id ?? null,
        });
      }

      return company;
    },
    onSuccess: async (company) => {
      await reloadCompanies();
      queryClient.invalidateQueries();
      pushToast({ title: "Company created", body: `"${company.name}" is ready with ${template!.agents.length} agents.` });
      navigate(`/${company.issuePrefix}/dashboard`);
    },
    onError: (err) => {
      setStep("customize");
      pushToast({
        title: "Failed to create company",
        body: err instanceof Error ? err.message : "Unknown error",
        tone: "error",
      });
    },
  });

  if (step === "creating") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <div className="text-center">
          <p className="text-sm font-medium">Setting up your company...</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Creating agents, projects, and starter tasks
          </p>
        </div>
      </div>
    );
  }

  if (step === "customize" && template) {
    return (
      <div className="mx-auto max-w-lg py-6">
        <button
          onClick={() => setStep("choose")}
          className="text-xs text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1"
        >
          ← Back to templates
        </button>

        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", template.bgColor)}>
              <template.icon className={cn("h-5 w-5", template.color)} />
            </div>
            <div>
              <h2 className="text-lg font-semibold">{template.name}</h2>
              <p className="text-xs text-muted-foreground">{template.description}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Company Name</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder={template.companyName}
                className="mt-1 w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
              />
            </div>

            <div>
              <h3 className="text-xs font-medium text-muted-foreground mb-2">Agents ({template.agents.length})</h3>
              <div className="space-y-1.5">
                {template.agents.map((agent) => (
                  <div key={agent.name} className="flex items-center gap-2 rounded-md bg-muted/30 px-3 py-2">
                    <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium">{agent.name}</span>
                    <span className="text-xs text-muted-foreground">{agent.title}</span>
                    <span className={cn(
                      "ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                      agent.role === "ceo" ? "bg-amber-500/10 text-amber-600" :
                      agent.role === "manager" ? "bg-blue-500/10 text-blue-600" :
                      "bg-muted text-muted-foreground",
                    )}>
                      {agent.role}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-medium text-muted-foreground mb-2">Projects ({template.projects.length})</h3>
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
                Starter Tasks ({template.starterIssues.length})
              </h3>
              <div className="space-y-1.5">
                {template.starterIssues.map((issue) => (
                  <div key={issue.title} className="flex items-center gap-2 rounded-md bg-muted/30 px-3 py-2">
                    <span className="text-sm truncate">{issue.title}</span>
                    <span className={cn(
                      "ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                      issue.priority === "urgent" ? "bg-red-500/10 text-red-600" :
                      issue.priority === "high" ? "bg-orange-500/10 text-orange-600" :
                      "bg-muted text-muted-foreground",
                    )}>
                      {issue.priority}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setStep("choose")}>
              Back
            </Button>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending} className="gap-1.5">
              {createMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowRight className="h-3.5 w-3.5" />
              )}
              Create Company
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Company Templates</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a pre-configured template to get started quickly with agents, projects, and starter tasks.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TEMPLATES.map((tpl) => (
          <TemplateCard
            key={tpl.id}
            template={tpl}
            selected={selected === tpl.id}
            onSelect={() => {
              setSelected(tpl.id);
              setCompanyName("");
              setStep("customize");
            }}
          />
        ))}
      </div>
    </div>
  );
}
