import { api } from "./client";

/** Matches the server's `publicTemplate` projection (not the raw FleetTemplate). */
export interface FleetTemplateListItem {
  id: string;
  name: string;
  tagline: string;
  description: string;
  icon: string;
  color: string;
  bgColor: string;
  bestFor: string;
  estimatedSetupMinutes: number;
  agentCount: number;
  projectCount: number;
  routineCount: number;
  starterTaskCount: number;
  starterOutcomeCount: number;
  requiredAdapters: string[];
  agents: {
    slug: string;
    name: string;
    role: "ceo" | "manager" | "specialist";
    title: string;
    reportsToSlug: string | null;
    capabilities: string;
  }[];
  projects: { name: string; description: string }[];
  routines: {
    title: string;
    description: string | null;
    assigneeSlug: string;
    cadence: string;
  }[];
  starterTasks: {
    title: string;
    description: string;
    priority: "urgent" | "high" | "medium" | "low";
    assigneeSlug: string;
  }[];
  starterOutcomes: {
    title: string;
    brief: string;
    targetFormat:
      | "report"
      | "memo"
      | "deck_outline"
      | "email"
      | "strategy"
      | "audit"
      | "research_brief"
      | "custom";
  }[];
}

export interface FleetInstallResult {
  templateId: string;
  companyId: string;
  agents: { slug: string; id: string; name: string }[];
  projects: { name: string; id: string }[];
  starterTasks: { title: string; id: string; assigneeAgentId: string | null }[];
  skipped: { routines: number };
}

export const fleetTemplatesApi = {
  list: () => api.get<FleetTemplateListItem[]>("/fleet-templates"),
  get: (templateId: string) => api.get<FleetTemplateListItem>(`/fleet-templates/${templateId}`),
  install: (companyId: string, templateId: string) =>
    api.post<FleetInstallResult>(
      `/companies/${companyId}/fleet-templates/${templateId}/install`,
      {},
    ),
};
