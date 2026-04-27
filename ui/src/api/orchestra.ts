/**
 * Orchestra API client.
 *
 * Mirrors the server routes in server/src/routes/orchestra.ts. CRUD +
 * planning + approval + cancellation.
 */
import type {
  CreateOutcomeRequest,
  Outcome,
  OutcomeListItem,
  OutcomeDetail,
} from "@orqestra/shared";
import { api } from "./client";

export interface GeneratePlanResult {
  planId: string;
  requiresClarification: boolean;
  missingInputs: Array<{ field: string; question: string; required: boolean }>;
}

export interface ApprovePlanResult {
  plan: { id: string; status: string; version: number };
  issueIds: string[];
}

export interface OrchestraTimelineEvent {
  id: string;
  kind: string;
  summary: string;
  data: Record<string, unknown> | null;
  occurredAt: string;
}

export const orchestraApi = {
  list: (companyId: string) =>
    api.get<OutcomeListItem[]>(
      `/companies/${companyId}/orchestra/outcomes`,
    ),
  create: (companyId: string, input: CreateOutcomeRequest) =>
    api.post<Outcome>(
      `/companies/${companyId}/orchestra/outcomes`,
      input,
    ),
  get: (outcomeId: string) =>
    api.get<OutcomeDetail>(`/orchestra/outcomes/${outcomeId}`),
  cancel: (outcomeId: string, reason?: string) =>
    api.post<Outcome>(`/orchestra/outcomes/${outcomeId}/cancel`, { reason }),
  generatePlan: (outcomeId: string) =>
    api.post<GeneratePlanResult>(
      `/orchestra/outcomes/${outcomeId}/plan`,
      {},
    ),
  approvePlan: (outcomeId: string, planId: string, comment?: string) =>
    api.post<ApprovePlanResult>(
      `/orchestra/outcomes/${outcomeId}/approve-plan`,
      { planId, comment },
    ),
  events: (outcomeId: string) =>
    api.get<OrchestraTimelineEvent[]>(
      `/orchestra/outcomes/${outcomeId}/events`,
    ),
};
