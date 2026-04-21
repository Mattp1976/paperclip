/**
 * Help — the in-app getting-started and how-to-use page.
 *
 * Paperclip has grown a lot of surface area (Tasks / Agents / Swarm /
 * Runs / Outputs / Approvals / Routines) and new users don't always
 * know where to start or what the moving parts are for. This page is
 * the single place to orient them — it explains the core concepts in
 * plain language, points to the most common workflows, and answers
 * the "what do I do first?" question with a short checklist.
 *
 * Kept deliberately static (no API calls) so it loads instantly and
 * is safe to surface from anywhere in the app.
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDot,
  FolderKanban,
  LayoutDashboard,
  Orbit,
  type LucideIcon,
  Plus,
  Sparkles,
  Target,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { SoftCard } from "../components/SoftCard";
import { cn } from "../lib/utils";

interface ConceptCardProps {
  icon: LucideIcon;
  title: string;
  blurb: string;
  to: string;
  cta: string;
}

function ConceptCard({ icon: Icon, title, blurb, to, cta }: ConceptCardProps) {
  return (
    <SoftCard padding="tight" className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sage-surface text-sage-ink">
          <Icon className="h-4.5 w-4.5" strokeWidth={2} />
        </span>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <p className="flex-1 text-sm leading-relaxed text-muted-foreground">{blurb}</p>
      <Link
        to={to}
        className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        {cta}
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </SoftCard>
  );
}

interface ChecklistItemProps {
  number: number;
  title: string;
  description: ReactNode;
  action?: { label: string; to: string };
}

function ChecklistItem({ number, title, description, action }: ChecklistItemProps) {
  return (
    <li className="flex items-start gap-4">
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          "bg-sage-surface text-[11px] font-semibold text-sage-ink",
        )}
        aria-hidden
      >
        {number}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="mt-0.5 text-sm text-muted-foreground">{description}</div>
        {action && (
          <Link
            to={action.to}
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {action.label}
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
    </li>
  );
}

interface GlossaryRowProps {
  term: string;
  definition: ReactNode;
}

function GlossaryRow({ term, definition }: GlossaryRowProps) {
  return (
    <div className="grid grid-cols-[140px,1fr] items-baseline gap-4 py-2">
      <dt className="text-sm font-medium text-foreground">{term}</dt>
      <dd className="text-sm text-muted-foreground">{definition}</dd>
    </div>
  );
}

interface FaqItemProps {
  question: string;
  answer: ReactNode;
}

function FaqItem({ question, answer }: FaqItemProps) {
  return (
    <details className="group rounded-xl border border-border/50 px-4 py-3 open:bg-muted/30">
      <summary className="cursor-pointer list-none text-sm font-semibold text-foreground marker:hidden">
        <span className="inline-block w-4 text-muted-foreground transition-transform group-open:rotate-90">
          ›
        </span>
        {question}
      </summary>
      <div className="mt-2 pl-4 text-sm leading-relaxed text-muted-foreground">{answer}</div>
    </details>
  );
}

const CONCEPTS: ConceptCardProps[] = [
  {
    icon: Bot,
    title: "Agents",
    blurb:
      "The AI employees on your team. Each agent has a role, model tier, and a playbook of things it knows how to do. You'll hire and configure these first.",
    to: "/agents",
    cta: "Manage agents",
  },
  {
    icon: CircleDot,
    title: "Tasks",
    blurb:
      "Anything you want the team to do, written the way you'd write it for a human. Assign a task to an agent (or let the team pick) and it kicks off a run.",
    to: "/issues",
    cta: "Open your tasks",
  },
  {
    icon: FolderKanban,
    title: "Projects",
    blurb:
      "Group related tasks and give the team shared context — a brief, a codebase, success metrics. Outputs land in the project's folder.",
    to: "/projects",
    cta: "See projects",
  },
  {
    icon: Target,
    title: "Goals",
    blurb:
      "The higher-level outcomes your company is pushing toward. Goals show up on the dashboard so the team knows why it's doing what it's doing.",
    to: "/goals",
    cta: "Browse goals",
  },
  {
    icon: Orbit,
    title: "Swarm",
    blurb:
      "Live network view of the whole team. Each orb is an agent; pulsing means it's running right now. Click one to see what it's working on.",
    to: "/swarm",
    cta: "Watch the swarm",
  },
  {
    icon: Sparkles,
    title: "Outputs",
    blurb:
      "The finished work the team has delivered — docs, decks, PDFs, code. Filtered by task and run so you can quickly find what you're after.",
    to: "/outputs",
    cta: "Recent outputs",
  },
];

const GETTING_STARTED: ChecklistItemProps[] = [
  {
    number: 1,
    title: "Set up your company",
    description:
      "Name, logo, and a one-paragraph brief about what the business does. Agents use this to stay in character.",
    action: { label: "Company settings", to: "/company/settings" },
  },
  {
    number: 2,
    title: "Hire your first agents",
    description:
      "Start with a CEO and a few direct reports. Each agent picks a model tier (Haiku, Sonnet, or Opus) — pick Haiku for routine work, Sonnet for most day-to-day, Opus for the heaviest thinking.",
    action: { label: "Add an agent", to: "/agents/new" },
  },
  {
    number: 3,
    title: "Write your first task",
    description: (
      <>
        Use the <span className="font-medium text-foreground">New Task</span> button in the
        sidebar. Write it like a Slack message to a colleague — outcomes over step-by-step
        instructions.
      </>
    ),
    action: { label: "Open Tasks", to: "/issues" },
  },
  {
    number: 4,
    title: "Watch it run",
    description:
      "The Swarm page shows live activity. The agent streams its work as it goes — you can approve, ask for changes, or kill the run from there.",
    action: { label: "Open the Swarm", to: "/swarm" },
  },
  {
    number: 5,
    title: "Check the output",
    description:
      "Finished deliverables land in Outputs — grouped by task and run, downloadable as files.",
    action: { label: "Review outputs", to: "/outputs" },
  },
];

export function Help() {
  return (
    <div className="mx-auto w-full max-w-5xl px-8 pt-10 pb-16 space-y-10">
      <PageHeader
        eyebrow="Getting started"
        title="How to use Paperclip"
        subtitle="A quick tour of the moving parts and a five-step checklist to go from empty workspace to first delivered output."
      />

      {/* Intro quote */}
      <SoftCard padding="roomy" className="bg-sage-surface/50 border-sage-mist/60">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-sage-ink shadow-sm"
            aria-hidden
          >
            <LayoutDashboard className="h-6 w-6" strokeWidth={1.75} />
          </div>
          <div className="flex-1">
            <p className="text-base font-semibold text-foreground">
              Think of Paperclip as an AI company you manage.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              You hire agents, give them tasks, and they produce outputs — the same shape as a
              real team, with the same pages you'd expect in a real HR/PM tool.
            </p>
          </div>
        </div>
      </SoftCard>

      {/* Core concepts grid */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Core concepts</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CONCEPTS.map((c) => (
            <ConceptCard key={c.title} {...c} />
          ))}
        </div>
      </section>

      {/* Getting started checklist */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Your first five minutes</h2>
        <SoftCard padding="roomy">
          <ol className="space-y-5">
            {GETTING_STARTED.map((step) => (
              <ChecklistItem key={step.number} {...step} />
            ))}
          </ol>
        </SoftCard>
      </section>

      {/* Glossary — quick terminology reference */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Words to know</h2>
        <SoftCard padding="roomy">
          <dl className="divide-y divide-border/40">
            <GlossaryRow
              term="Run"
              definition="One execution of a task by an agent. A task can have many runs if you ask for revisions or retry."
            />
            <GlossaryRow
              term="Heartbeat"
              definition="The live signal from an in-progress run — lets the UI show streaming progress and keeps the Swarm orbs pulsing."
            />
            <GlossaryRow
              term="Approval"
              definition="A run that's paused waiting for your sign-off before doing something irreversible (spend, email, commit)."
            />
            <GlossaryRow
              term="Routine"
              definition="A task that repeats on a schedule — weekly status updates, daily standups, etc."
            />
            <GlossaryRow
              term="Fleet"
              definition="Infrastructure view: which runners are up, their queue depth, and recent activity."
            />
            <GlossaryRow
              term="Skills"
              definition="Reusable capability packs (plugins) you can grant to agents — things like 'send email', 'query Postgres', 'deploy to Vercel'."
            />
          </dl>
        </SoftCard>
      </section>

      {/* FAQ — short, high-signal */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Frequently asked</h2>
        <div className="space-y-2">
          <FaqItem
            question="Which model tier should I pick for a new agent?"
            answer={
              <>
                Default to <span className="font-medium text-foreground">Sonnet</span>. Drop to{" "}
                <span className="font-medium text-foreground">Haiku</span> for cheap routine jobs
                (daily summaries, simple formatting) and upgrade to{" "}
                <span className="font-medium text-foreground">Opus</span> for your executive layer
                or anything needing deep judgement.
              </>
            }
          />
          <FaqItem
            question="How do I stop a run that's gone off the rails?"
            answer={
              <>
                Open the run (from the Swarm, the agent's page, or the task) and click the kill
                switch. The agent will wrap up in-flight work, return whatever it has, and mark
                the run as cancelled.
              </>
            }
          />
          <FaqItem
            question="Where do agent outputs actually live on my disk?"
            answer={
              <>
                Under your Paperclip instance folder at{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                  ~/.paperclip/instances/&lt;id&gt;/projects/&lt;company&gt;/&lt;project&gt;/runs/&lt;runId&gt;/
                </code>
                . Each run gets its own folder with <code className="text-[11px]">logs.ndjson</code>,{" "}
                <code className="text-[11px]">artifacts/</code>, and{" "}
                <code className="text-[11px]">exports/</code> subfolders.
              </>
            }
          />
          <FaqItem
            question="Do agents have memory between runs?"
            answer={
              <>
                Yes — each agent has a playbook (long-lived memory) and run history (recent
                context). You can see and edit these on the agent's detail page under the
                Playbook and Runs tabs.
              </>
            }
          />
          <FaqItem
            question="Can I use my own API keys?"
            answer={
              <>
                Yes. Go to <Link to="/company/secrets" className="text-primary hover:underline">
                Company → Secrets</Link> and paste an Anthropic (or other supported) key. Keys are
                encrypted at rest with the instance master key.
              </>
            }
          />
        </div>
      </section>

      {/* Call to action */}
      <SoftCard padding="roomy" className="bg-primary/10 border-primary/20">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-base font-semibold text-foreground">
              Ready? Start with the basics.
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Hire an agent, write a task, and watch the swarm do its thing.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/agents/new"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2",
                "text-sm font-semibold text-primary-foreground shadow-sm hover:brightness-105",
              )}
            >
              <Plus className="h-3.5 w-3.5" />
              Hire an agent
            </Link>
            <Link
              to="/issues"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2",
                "text-sm font-semibold text-foreground hover:bg-muted",
              )}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Open tasks
            </Link>
          </div>
        </div>
      </SoftCard>
    </div>
  );
}
