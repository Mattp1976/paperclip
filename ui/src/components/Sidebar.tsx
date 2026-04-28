import {
  Inbox,
  CircleDot,
  Target,
  LayoutDashboard,
  DollarSign,
  History,
  Search,
  SquarePen,
  Network,
  Boxes,
  Repeat,
  Settings,
  FolderKanban,
  Bot,
  Plus,
  CheckCircle2,
  Orbit,
  Ship,
  FileStack,
  Sparkles,
  HelpCircle,
  Megaphone,
  Wand2,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { SidebarNavItem } from "./SidebarNavItem";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { heartbeatsApi } from "../api/heartbeats";
import { queryKeys } from "../lib/queryKeys";
import { useInboxBadge } from "../hooks/useInboxBadge";
import { Button } from "@/components/ui/button";
import { PluginSlotOutlet } from "@/plugins/slots";

export function Sidebar() {
  const { openNewIssue, openComposer } = useDialog();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const inboxBadge = useInboxBadge(selectedCompanyId);
  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });
  const liveRunCount = liveRuns?.length ?? 0;

  function openSearch() {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
  }

  const pluginContext = {
    companyId: selectedCompanyId,
    companyPrefix: selectedCompany?.issuePrefix ?? null,
  };

  return (
    <aside className="w-[260px] h-full min-h-0 border-r border-border/30 bg-stone-50/50 dark:bg-background flex flex-col">
      {/* Company header */}
      <div className="flex items-center gap-3 px-5 h-14 shrink-0 border-b border-border/20">
        {selectedCompany?.brandColor && (
          <div
            className="w-7 h-7 rounded-lg shrink-0 shadow-sm"
            style={{ backgroundColor: selectedCompany.brandColor }}
          />
        )}
        <span className="flex-1 text-sm font-semibold text-foreground truncate">
          {selectedCompany?.name ?? "Select company"}
        </span>
        <button
          onClick={openSearch}
          className="p-2 rounded-lg text-muted-foreground/40 hover:text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0"
        >
          <Search className="h-4 w-4" />
        </button>
      </div>

      {/* Quick actions */}
      <div className="px-3 pt-4 pb-2">
        <Button
          variant="sage-elevated"
          size="none"
          onClick={() => openNewIssue()}
          className="w-full gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold"
        >
          <Plus className="h-4 w-4" />
          New task
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 min-h-0 overflow-y-auto scrollbar-auto-hide flex flex-col gap-7 px-3 py-4">
        {/* Primary */}
        <div className="flex flex-col gap-1">
          <SidebarNavItem to="/dashboard" label="Dashboard" icon={LayoutDashboard} liveCount={liveRunCount} />
          <SidebarNavItem to="/start" label="Start" icon={Wand2} />
          <SidebarNavItem to="/clipmart" label="Clipmart" icon={Boxes} />
          <SidebarNavItem
            to="/inbox"
            label="Inbox"
            icon={Inbox}
            badge={inboxBadge.inbox}
            badgeTone={inboxBadge.failedRuns > 0 ? "danger" : "default"}
            alert={inboxBadge.failedRuns > 0}
          />
          <SidebarNavItem to="/standup" label="Standup" icon={Megaphone} />
          <SidebarNavItem to="/outcomes" label="Outcomes" icon={Sparkles} />
          <SidebarNavItem to="/outputs" label="Outputs" icon={Sparkles} />
          <SidebarNavItem to="/issues" label="Tasks" icon={CircleDot} />
          <SidebarNavItem to="/decisions" label="Decisions" icon={CheckCircle2} />
          <PluginSlotOutlet
            slotTypes={["sidebar"]}
            context={pluginContext}
            className="flex flex-col gap-1"
            itemClassName="text-sm font-medium"
            missingBehavior="placeholder"
          />
        </div>

        {/* Workspace */}
        <div className="flex flex-col gap-1">
          <div className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/40">
            Workspace
          </div>
          <SidebarNavItem to="/projects" label="Projects" icon={FolderKanban} />
          <SidebarNavItem to="/agents" label="Agents" icon={Bot} />
          <SidebarNavItem to="/swarm" label="Swarm" icon={Orbit} />
          <SidebarNavItem to="/fleet" label="Fleet" icon={Ship} />
          <SidebarNavItem to="/goals" label="Goals" icon={Target} />
          <SidebarNavItem to="/routines" label="Routines" icon={Repeat} textBadge="Beta" textBadgeTone="amber" />
        </div>

        {/* Company */}
        <div className="flex flex-col gap-1">
          <div className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/40">
            Company
          </div>
          <SidebarNavItem to="/org" label="Organisation" icon={Network} />
          <SidebarNavItem to="/skills" label="Skills" icon={Boxes} />
          <SidebarNavItem to="/templates" label="Templates" icon={FileStack} />
          <SidebarNavItem to="/costs" label="Costs" icon={DollarSign} />
          <SidebarNavItem to="/activity" label="Activity" icon={History} />
          <SidebarNavItem to="/company/settings" label="Settings" icon={Settings} />
          <SidebarNavItem to="/help" label="Help" icon={HelpCircle} />
        </div>

        <PluginSlotOutlet
          slotTypes={["sidebarPanel"]}
          context={pluginContext}
          className="flex flex-col gap-3"
          itemClassName="rounded-xl border border-border/30 p-3"
          missingBehavior="placeholder"
        />
      </nav>

      {/* Bottom quick actions */}
      <div className="shrink-0 border-t border-border/20 px-3 py-3">
        <button
          onClick={() => openComposer()}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-muted-foreground/70 hover:bg-black/5 dark:hover:bg-white/5 hover:text-foreground transition-colors"
        >
          <SquarePen className="h-4 w-4 shrink-0" />
          <span>New…</span>
          <span className="ml-auto text-[10px] text-muted-foreground/30 font-mono">⇧Space</span>
        </button>
      </div>
    </aside>
  );
}
