/**
 * WelcomeZeroState — shown on the Dashboard before any agents exist.
 *
 * Replaces the zero-filled 8-section default dashboard with a calmer
 * onboarding surface: a warm welcome hero + a 3-step getting-started
 * checklist. The active step is the earliest incomplete one.
 */
import { Bot, CheckCircle2, Circle, Building2, ListChecks } from "lucide-react";
import { Link } from "@/lib/router";

type StepKey = "company" | "agent" | "task";

interface WelcomeZeroStateProps {
  /** True once the user has at least one company selected. */
  hasCompany: boolean;
  /** True once this company has ≥1 agent. */
  hasAgent: boolean;
  /** True once this company has ≥1 task/issue. */
  hasTask: boolean;
  /** Opens the onboarding dialog starting at the "pick/create a company" step. */
  onStartCompany: () => void;
  /** Opens the onboarding dialog starting at the "create your first agent" step. */
  onHireAgent: () => void;
  /** Opens the New Task dialog. */
  onNewTask: () => void;
}

function stepIcon(state: "done" | "active" | "pending") {
  if (state === "done") return CheckCircle2;
  if (state === "active") return Circle;
  return Circle;
}

export function WelcomeZeroState({
  hasCompany,
  hasAgent,
  hasTask,
  onStartCompany,
  onHireAgent,
  onNewTask,
}: WelcomeZeroStateProps) {
  // Determine which step is active (first incomplete).
  const activeStep: StepKey = !hasCompany
    ? "company"
    : !hasAgent
      ? "agent"
      : "task";

  const steps: Array<{
    key: StepKey;
    title: string;
    blurb: string;
    cta: string;
    icon: typeof Building2;
    onClick: () => void;
    done: boolean;
  }> = [
    {
      key: "company",
      title: "Create your company",
      blurb: "Companies are the container for your agents, tasks, budgets, and policies.",
      cta: "Set up company",
      icon: Building2,
      onClick: onStartCompany,
      done: hasCompany,
    },
    {
      key: "agent",
      title: "Hire your first agent",
      blurb: "Each agent has a role and a brief. Pick a template or describe what you need.",
      cta: "Hire agent",
      icon: Bot,
      onClick: onHireAgent,
      done: hasAgent,
    },
    {
      key: "task",
      title: "Give them a task",
      blurb: "Tasks are the unit of work. Your agent will start immediately.",
      cta: "New task",
      icon: ListChecks,
      onClick: onNewTask,
      done: hasTask,
    },
  ];

  return (
    <div className="space-y-8 pb-6">
      {/* Welcome hero */}
      <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-[#FAF7F2] via-[#F6F0E7] to-[#EFE6D9] px-8 py-10 dark:from-[#22251F] dark:via-[#2A2D26] dark:to-[#32352E]">
        <div className="relative z-10 max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#8FA781]">
            Welcome to Paperclip
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">
            Let's get your agents set up.
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            Paperclip runs a fleet of AI agents that work on your behalf — planning,
            researching, writing, coding, and reporting back. Three quick steps and
            you'll have an agent running its first task.
          </p>
        </div>
        {/* Decorative corner blob */}
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#A4BD95]/20 blur-3xl dark:bg-[#8FA781]/15" />
        <div className="pointer-events-none absolute -right-32 bottom-0 h-72 w-72 rounded-full bg-[#D9A5A5]/15 blur-3xl dark:bg-[#D9A5A5]/10" />
      </div>

      {/* Checklist */}
      <div className="rounded-3xl border border-border bg-card/60 p-2">
        <ol className="divide-y divide-border/60">
          {steps.map((step, idx) => {
            const state: "done" | "active" | "pending" = step.done
              ? "done"
              : activeStep === step.key
                ? "active"
                : "pending";
            const Icon = stepIcon(state);
            const StepGlyph = step.icon;

            return (
              <li
                key={step.key}
                className="flex flex-col gap-4 px-6 py-6 sm:flex-row sm:items-center sm:gap-6"
              >
                {/* Number + state */}
                <div className="flex items-center gap-4">
                  <Icon
                    className={
                      state === "done"
                        ? "h-6 w-6 text-[#7C9470]"
                        : state === "active"
                          ? "h-6 w-6 text-[#8FA781]"
                          : "h-6 w-6 text-muted-foreground/40"
                    }
                    strokeWidth={state === "done" ? 2 : 1.5}
                  />
                  <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground/70">
                    Step {idx + 1}
                  </span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <StepGlyph
                      className={
                        state === "pending"
                          ? "h-4 w-4 text-muted-foreground/40"
                          : "h-4 w-4 text-muted-foreground"
                      }
                    />
                    <h3
                      className={
                        state === "done"
                          ? "text-base font-semibold text-muted-foreground line-through"
                          : "text-base font-semibold text-foreground"
                      }
                    >
                      {step.title}
                    </h3>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                    {step.blurb}
                  </p>
                </div>

                {/* CTA */}
                <div className="shrink-0">
                  {state === "done" ? (
                    <span className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-[#7C9470]">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Done
                    </span>
                  ) : state === "active" ? (
                    <button
                      onClick={step.onClick}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#8FA781] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-[#7C9470] hover:shadow-md hover:shadow-green-700/20 active:scale-[0.98] dark:bg-[#A4BD95] dark:hover:bg-[#B5C4B1] dark:text-[#22251F]"
                    >
                      {step.cta}
                    </button>
                  ) : (
                    <button
                      onClick={step.onClick}
                      disabled
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground/50 cursor-not-allowed"
                      title="Complete the previous step first"
                    >
                      {step.cta}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Helpful links */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-2 text-sm text-muted-foreground">
        <span>Want to explore first?</span>
        <Link
          to="/templates"
          className="text-[#7C9470] hover:text-[#8FA781] underline-offset-4 hover:underline"
        >
          Browse company templates
        </Link>
        <Link
          to="/design-guide"
          className="text-[#7C9470] hover:text-[#8FA781] underline-offset-4 hover:underline"
        >
          Design guide
        </Link>
      </div>
    </div>
  );
}
