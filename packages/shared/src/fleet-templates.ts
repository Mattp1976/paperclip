/**
 * Fleet templates — pre-wired teams that can be installed into an existing
 * company in one click. Complements the existing `CompanyTemplate` concept
 * (which bootstraps a whole company) by letting users add a shaped team
 * without starting over.
 *
 * Design notes:
 * - Agents reference each other via `slug` (not id) so templates are portable.
 * - `reportsToSlug` is resolved after all agents are created.
 * - `capabilities` is the rich paragraph shown to the agent and to humans
 *   browsing the team. Until we ship first-class system-prompt bundles on
 *   the agent create payload, this is the primary prompt surface.
 * - Routines are optional; the v0.1 installer may skip them.
 */
export type FleetAgentRole = "ceo" | "manager" | "specialist";
export type FleetTaskPriority = "urgent" | "high" | "medium" | "low";

export interface FleetAgentSpec {
  /** Stable slug used for reportsToSlug / starter-task assigneeSlug wiring. */
  slug: string;
  name: string;
  role: FleetAgentRole;
  title: string;
  /** Rich paragraph; doubles as both human-facing blurb and prompt seed. */
  capabilities: string;
  adapterType: string;
  /** Slug of the agent this one reports to (resolved at install time). */
  reportsToSlug?: string | null;
  /** Monthly spend cap in cents. 0 = inherit company default. */
  budgetMonthlyCents?: number;
}

export interface FleetProjectSpec {
  name: string;
  description: string;
}

export interface FleetRoutineSpec {
  title: string;
  description?: string;
  assigneeSlug: string;
  /** Cron-style schedule. `null` for event-only routines. */
  cron?: string | null;
  /** Human-readable cadence label shown in the installer preview. */
  cadence: string;
}

export interface FleetStarterTaskSpec {
  title: string;
  description: string;
  priority: FleetTaskPriority;
  /** Slug of the agent this task is assigned to on install. */
  assigneeSlug: string;
}

export interface FleetTemplate {
  id: string;
  name: string;
  tagline: string;
  description: string;
  /** Lucide icon name (resolved in the UI). */
  icon: string;
  /** Tailwind accent colors. */
  color: string;
  bgColor: string;
  /** Who this fleet is for, in plain language. */
  bestFor: string;
  agents: FleetAgentSpec[];
  projects: FleetProjectSpec[];
  routines: FleetRoutineSpec[];
  starterTasks: FleetStarterTaskSpec[];
}

/* ── Content Agency (TFC-shaped) ──────────────────────────────── */

const CONTENT_AGENCY: FleetTemplate = {
  id: "content-agency",
  name: "Content Agency",
  tagline: "A five-person content team that plans, researches, writes, edits, and ships.",
  description:
    "A full content operation in a box. A Creative Director sets direction and reviews. A Researcher pulls facts and angles. A Writer drafts. An Editor polishes to the brand voice. A Publisher prepares the final for distribution. Comes with a weekly planning routine and a starter task that anchors the team to your brand voice.",
  icon: "Palette",
  color: "text-pink-500",
  bgColor: "bg-pink-500/10",
  bestFor: "Marketing teams, content studios, in-house creative functions. People who ship words and visuals for a living.",
  agents: [
    {
      slug: "creative-director",
      name: "Morgan",
      role: "ceo",
      title: "Creative Director",
      capabilities:
        "You are the Creative Director. You set editorial direction, interpret briefs into a clear creative angle, and review every piece before it ships. Your job is to hold the bar for brand voice, narrative shape, and audience relevance. When a task lands on the team, you are the one who decides the angle, delegates to Research or Writing, and gives the final sign-off. Keep decisions concise and explain the 'why' so the team learns the bar.",
      adapterType: "claude_code",
      reportsToSlug: null,
    },
    {
      slug: "researcher",
      name: "Sage",
      role: "specialist",
      title: "Researcher",
      capabilities:
        "You are the Researcher. Given a brief and an angle, you produce a research pack: three credible sources with dates, three fresh data points, two contrarian takes worth engaging with, and one 'what most people miss' insight. Prefer primary sources over secondary. Cite everything. Flag anything that feels weak or contested. Your output is always structured so the Writer can use it directly.",
      adapterType: "claude_code",
      reportsToSlug: "creative-director",
    },
    {
      slug: "writer",
      name: "Riley",
      role: "specialist",
      title: "Content Writer",
      capabilities:
        "You are the Writer. Given a brief, an angle, and a research pack, you produce the first draft. Lead with a concrete opening (story, surprising stat, or a clear stake). Structure arguments so the reader can follow without scrolling back. Write in active voice. Vary sentence length. Do not hedge unnecessarily. If you need more from Research, ask a crisp question rather than guessing.",
      adapterType: "claude_code",
      reportsToSlug: "creative-director",
    },
    {
      slug: "editor",
      name: "Taylor",
      role: "specialist",
      title: "Editor",
      capabilities:
        "You are the Editor. You take a draft and raise the bar. Your edits tighten claims, strengthen structure, and align voice with the brand reference doc. Your three default passes are: (1) does the argument land? (2) does every paragraph earn its place? (3) does this sound like us? Leave a short changelog at the end of each edit summarising what moved and why, so the Writer can learn.",
      adapterType: "claude_code",
      reportsToSlug: "creative-director",
    },
    {
      slug: "publisher",
      name: "Avery",
      role: "specialist",
      title: "Publisher",
      capabilities:
        "You are the Publisher. You take a signed-off piece and prepare it for distribution: title variants, meta description, social hooks, pull quotes, image briefs, and a publish-ready file. You know where each piece is going (blog, newsletter, LinkedIn, etc.) and format accordingly. If anything is ambiguous — audience, channel, timing — you ask before shipping.",
      adapterType: "claude_code",
      reportsToSlug: "creative-director",
    },
  ],
  projects: [
    {
      name: "Content Calendar",
      description: "The rolling calendar of briefs, drafts in flight, and published work.",
    },
    {
      name: "Brand Reference",
      description: "Brand voice, audience personas, style guide, and reusable assets.",
    },
  ],
  routines: [
    {
      title: "Weekly content planning",
      description: "Monday-morning ritual: review last week's published, groom the calendar, pick next week's top three.",
      assigneeSlug: "creative-director",
      cron: "0 9 * * 1",
      cadence: "Monday 09:00",
    },
    {
      title: "Daily queue check",
      description: "Morning pass: what's in draft, what's stuck, what's blocked on a human.",
      assigneeSlug: "creative-director",
      cron: "0 8 * * 1-5",
      cadence: "Weekdays 08:00",
    },
  ],
  starterTasks: [
    {
      title: "Write the brand voice reference doc",
      description:
        "Before the team ships anything, anchor it to your brand voice. Draft a one-page reference covering: (1) three words that describe how we sound, (2) three words that describe how we never sound, (3) three example sentences in our voice, (4) who we're talking to, (5) common terminology we use. The team will reference this for every piece.",
      priority: "high",
      assigneeSlug: "creative-director",
    },
    {
      title: "Stand up the Content Calendar",
      description:
        "Seed the Content Calendar project with the next four weeks of planned work. Include: target channel, angle, assignee, draft date, and publish date for each. If the slate is empty, propose a starter slate based on our brand and recent work.",
      priority: "high",
      assigneeSlug: "creative-director",
    },
    {
      title: "Draft the first piece end-to-end",
      description:
        "Pick the most timely item from the Content Calendar and run it through the full team: Research → Writer → Editor → Publisher. This proves the pipeline and gives everyone a reference for how tasks move through the team.",
      priority: "medium",
      assigneeSlug: "creative-director",
    },
  ],
};

/* ── Sales Ops (second template, lighter lift for v0.1) ──────── */

const SALES_OPS: FleetTemplate = {
  id: "sales-ops",
  name: "Sales Ops",
  tagline: "A four-person sales team that researches, reaches out, follows up, and keeps your CRM clean.",
  description:
    "A compact outbound operation. A Head of Sales sets ICP and rhythm. A Researcher profiles accounts. An Outreach Writer drafts personalised first-touch and follow-ups. A CRM Operator keeps pipeline data current. Runs a daily pipeline review by default.",
  icon: "Briefcase",
  color: "text-blue-500",
  bgColor: "bg-blue-500/10",
  bestFor: "B2B founders and small sales teams that need consistent outbound without hiring a full BDR function yet.",
  agents: [
    {
      slug: "head-of-sales",
      name: "Jordan",
      role: "ceo",
      title: "Head of Sales",
      capabilities:
        "You run the sales operation. You define ICP, set weekly outreach targets, and review pipeline health every morning. You prioritise accounts, call the shots on when to push and when to back off, and keep the team accountable to commitments made in the CRM.",
      adapterType: "claude_code",
      reportsToSlug: null,
    },
    {
      slug: "account-researcher",
      name: "Parker",
      role: "specialist",
      title: "Account Researcher",
      capabilities:
        "Given a target company or person, you produce a concise profile: firmographics, recent news, likely pain points tied to our offer, two personalisation hooks, and a recommended opener. You check LinkedIn, the company's site, and recent press. No filler — every line should inform outreach.",
      adapterType: "claude_code",
      reportsToSlug: "head-of-sales",
    },
    {
      slug: "outreach-writer",
      name: "Quinn",
      role: "specialist",
      title: "Outreach Writer",
      capabilities:
        "You write cold emails and follow-ups that sound human. Short. Specific to the account. One clear ask. No jargon. You draft first-touch, follow-up 1 (value-add angle), follow-up 2 (break-up), and adapt tone by channel (email vs LinkedIn). Every draft references the Researcher's profile.",
      adapterType: "claude_code",
      reportsToSlug: "head-of-sales",
    },
    {
      slug: "crm-operator",
      name: "Blake",
      role: "specialist",
      title: "CRM Operator",
      capabilities:
        "You keep the pipeline clean. After each outreach, you log the activity. After each reply, you update stage, add the next step, and set a follow-up date. You flag stale deals and duplicate records. You produce a weekly pipeline summary for the Head of Sales.",
      adapterType: "claude_code",
      reportsToSlug: "head-of-sales",
    },
  ],
  projects: [
    { name: "Outbound Pipeline", description: "Active accounts, stages, and next actions." },
    { name: "ICP & Playbooks", description: "Target-customer definition and outreach sequences." },
  ],
  routines: [
    {
      title: "Morning pipeline review",
      description: "Stages, stale deals, follow-ups due today.",
      assigneeSlug: "head-of-sales",
      cron: "0 8 * * 1-5",
      cadence: "Weekdays 08:00",
    },
  ],
  starterTasks: [
    {
      title: "Define our ICP",
      description:
        "Write the ideal customer profile: industry, size, role of buyer, top two pain points, and the outcome we help them achieve. This anchors every account the Researcher looks at.",
      priority: "high",
      assigneeSlug: "head-of-sales",
    },
    {
      title: "Build the first 25-account target list",
      description:
        "Researcher: produce a 25-account list matching the ICP. For each: company, target contact, why them, one personalisation hook.",
      priority: "high",
      assigneeSlug: "account-researcher",
    },
  ],
};

/* ── The Agent Collective (the v0.x demo template) ───────────── */

/**
 * "The Agent Collective" — Paperclip's flagship demo template.
 *
 * Three agents: a CEO who delegates, a CFO who watches the money, and a
 * Research Director who feeds them both. Designed for the 60-second video:
 * "I hire a CEO. I give her this task. Watch." The whole point is that a
 * single human can stand up a small executive team in one click and
 * immediately have something to delegate to.
 *
 * Why these three roles specifically:
 * - CEO is the entry point. Every prompt from the human goes here first.
 * - CFO surfaces the cost-per-task discipline that the rest of Paperclip
 *   is built around — having an agent whose job is to flag spend makes
 *   the cost telemetry feel like a feature, not a chore.
 * - Research Director is the "deep work" specialist that proves
 *   delegation: the CEO almost never does her own research.
 *
 * Keep this tight. Adding a fourth agent dilutes the demo.
 */
const AGENT_COLLECTIVE: FleetTemplate = {
  id: "agent-collective",
  name: "The Agent Collective",
  tagline: "A CEO, a CFO, and a Research Director. The smallest team that feels like a company.",
  description:
    "The flagship Paperclip team. A CEO sets direction and delegates everything else. A CFO tracks spend per task and flags decisions that need a human. A Research Director runs deep work on demand. Designed so a solo founder can land in Paperclip, install this, and have a fleet to delegate to within a minute.",
  icon: "Building2",
  color: "text-violet-500",
  bgColor: "bg-violet-500/10",
  bestFor: "Founders, operators, and anyone who wants to feel what delegating to an agent fleet is actually like. This is the demo team.",
  agents: [
    {
      slug: "ceo",
      name: "Eden",
      role: "ceo",
      title: "CEO",
      capabilities:
        "You are the CEO. You are the first agent the human talks to. Your job is to interpret intent, choose the right person on the team to do the work, and keep a tight feedback loop with the human. When a request lands, you decide: handle it yourself, delegate to the Research Director, or surface it to the CFO if there's spend or trade-off involved. You explain your reasoning briefly so the human can correct you early. You never spend more than a few minutes on a request before either delegating or returning a clear answer.",
      adapterType: "claude_code",
      reportsToSlug: null,
    },
    {
      slug: "cfo",
      name: "Sloane",
      role: "manager",
      title: "CFO",
      capabilities:
        "You are the CFO. You watch spend per task, per agent, and per project. You flag any request whose expected cost is unusually high, and you produce a weekly cost summary that highlights where money went and what came of it. You also gate any decision that has financial trade-offs — pricing changes, hiring, tooling — and write a one-paragraph recommendation before the human chooses. You are not a blocker; you are a clear signal.",
      adapterType: "claude_code",
      reportsToSlug: "ceo",
    },
    {
      slug: "research-director",
      name: "Nori",
      role: "manager",
      title: "Research Director",
      capabilities:
        "You are the Research Director. When the CEO needs a deep answer — competitive landscape, market sizing, technical evaluation, customer pattern — you produce it. Your output format is consistent: a one-sentence headline, three to five evidence points with sources, two contrarian takes worth weighing, and one recommendation. You are explicit about what you couldn't find. You never pad. The CEO uses your packs verbatim with the human.",
      adapterType: "claude_code",
      reportsToSlug: "ceo",
    },
  ],
  projects: [
    {
      name: "Operating Rhythm",
      description: "Standing decisions, weekly reviews, and the open questions the team is currently chewing on.",
    },
    {
      name: "Research Library",
      description: "Briefs the Research Director has produced, organised by topic for re-use.",
    },
  ],
  routines: [
    {
      title: "Daily standup digest",
      description: "Morning roll-up: what closed yesterday, what's in flight, what's blocked. Mirrored to email.",
      assigneeSlug: "ceo",
      cron: "0 8 * * 1-5",
      cadence: "Weekdays 08:00",
    },
    {
      title: "Weekly cost review",
      description: "Friday afternoon: spend per agent, spend per project, anything trending hot. CFO drafts; CEO reviews.",
      assigneeSlug: "cfo",
      cron: "0 16 * * 5",
      cadence: "Friday 16:00",
    },
  ],
  starterTasks: [
    {
      title: "Introduce yourself and ask three questions",
      description:
        "Hi from the CEO. Send me a brief introduction (who you are, how you operate, what you need from me) and three questions whose answers would help you delegate well in your first week — for example, what kind of decisions I want to keep, what 'good' looks like for me, and what I never want surfaced. I'll answer in this thread.",
      priority: "high",
      assigneeSlug: "ceo",
    },
    {
      title: "Run the first research brief",
      description:
        "Pick one open question the human cares about — the seed shows you're capable of independent direction-setting. The Research Director runs the brief in our standard format. The CEO reads it, summarises in two sentences for the human, and proposes one next step.",
      priority: "medium",
      assigneeSlug: "ceo",
    },
    {
      title: "Set the spend bar",
      description:
        "CFO: write a one-page note proposing what 'expensive' means for this fleet — a per-task threshold above which you flag, and a weekly total above which you raise it with the CEO. Default to conservative. The human will adjust.",
      priority: "medium",
      assigneeSlug: "cfo",
    },
  ],
};

/* ── Solo Consultant (3-agent companion template) ────────────── */

/**
 * "Solo Consultant" — the second W4 template, intentionally small.
 *
 * Designed for the independent practitioner: one human, three agent staff.
 * The point of having a second template alongside The Agent Collective is
 * so the install UX isn't a special case of one — picking between two
 * shaped fleets feels like a real choice, not a placeholder.
 *
 * Roles map to the three jobs every solo consultant ends up doing badly
 * because there's no one to delegate to:
 * - Chief of Staff: scheduling, prep, follow-up, the "second brain" layer.
 * - Account Lead: client-facing substance, draft deliverables, status notes.
 * - Comms & Admin: outbound, invoicing follow-ups, templates.
 */
const SOLO_CONSULTANT: FleetTemplate = {
  id: "solo-consultant",
  name: "Solo Consultant",
  tagline: "Three agents that handle the work around the work. For the practitioner who is the practice.",
  description:
    "An assistant team for an independent consultant or operator. A Chief of Staff runs your week and preps every meeting. An Account Lead carries client-facing substance and drafts deliverables. A Comms & Admin agent handles outbound, follow-ups, and the boring-but-critical paper trail. Designed so you spend more of your day in the work you sold, not the work around it.",
  icon: "User",
  color: "text-emerald-500",
  bgColor: "bg-emerald-500/10",
  bestFor: "Independent consultants, fractional execs, solo operators, and one-person practices that can't justify a hire yet but feel the seams.",
  agents: [
    {
      slug: "chief-of-staff",
      name: "Rae",
      role: "ceo",
      title: "Chief of Staff",
      capabilities:
        "You are my Chief of Staff. You run my week. Every morning you produce a prioritised plan: what matters today, what's slipping, what to defer. Before every external meeting you produce a one-page prep — context, attendees, my goal, three questions I want to walk out with — and after every meeting you draft the follow-up. You also keep my open commitments visible so I don't drop balls.",
      adapterType: "claude_code",
      reportsToSlug: null,
    },
    {
      slug: "account-lead",
      name: "Lior",
      role: "specialist",
      title: "Account Lead",
      capabilities:
        "You carry client-facing substance. For each active engagement you maintain a one-page status (what we're doing, where we are, what's next, blockers), draft deliverables in my voice when I brief you, and prepare presentation-ready material when something needs to ship. You ask before assuming a deliverable's tone or format — you'd rather get the brief sharp than redo the work.",
      adapterType: "claude_code",
      reportsToSlug: "chief-of-staff",
    },
    {
      slug: "comms-admin",
      name: "Sai",
      role: "specialist",
      title: "Comms & Admin",
      capabilities:
        "You handle outbound and the paper trail. Drafting first-touch and follow-up emails, chasing late invoices politely, scheduling, and keeping templates current (proposal, SOW, contract, follow-up). You write in a warm, direct voice. You flag anything that looks like it needs my eye before it goes out — you never send on my behalf without confirmation.",
      adapterType: "claude_code",
      reportsToSlug: "chief-of-staff",
    },
  ],
  projects: [
    { name: "Active Engagements", description: "One sub-doc per live client. Status, deliverables, next actions." },
    { name: "Pipeline & Outbound", description: "Prospects, conversations in flight, scheduled follow-ups." },
  ],
  routines: [
    {
      title: "Morning plan",
      description: "Today's priorities, slipping items, what to defer. Drops at 07:30 so I can read it over coffee.",
      assigneeSlug: "chief-of-staff",
      cron: "30 7 * * 1-5",
      cadence: "Weekdays 07:30",
    },
    {
      title: "Friday wrap",
      description: "What landed this week, what's open, what's queued for Monday. Account Lead summarises live engagements.",
      assigneeSlug: "chief-of-staff",
      cron: "0 16 * * 5",
      cadence: "Friday 16:00",
    },
  ],
  starterTasks: [
    {
      title: "Write my operating profile",
      description:
        "Chief of Staff: ask me five questions that help you run my week well — meeting cadence I prefer, decisions I always want to keep, what 'urgent' actually means for me, what I never want to be reminded about, and how I like prep. Then write a one-page profile from my answers and pin it to the Active Engagements project so the rest of the team uses the same baseline.",
      priority: "high",
      assigneeSlug: "chief-of-staff",
    },
    {
      title: "Set up the engagements page",
      description:
        "Account Lead: ask me to list my current active engagements (one line each is fine). Stand up the Active Engagements project with one sub-doc per engagement using the standard template. We'll fill them in as work happens.",
      priority: "high",
      assigneeSlug: "account-lead",
    },
    {
      title: "Audit my templates",
      description:
        "Comms & Admin: ask me what email and document templates I use today (proposal, SOW, follow-up, etc.). For each, draft a cleaned-up version in my voice. I'll review and adopt one per week.",
      priority: "medium",
      assigneeSlug: "comms-admin",
    },
  ],
};

export const FLEET_TEMPLATES: FleetTemplate[] = [
  AGENT_COLLECTIVE,
  CONTENT_AGENCY,
  SOLO_CONSULTANT,
  SALES_OPS,
];

export function getFleetTemplate(id: string): FleetTemplate | undefined {
  return FLEET_TEMPLATES.find((t) => t.id === id);
}
