/**
 * Narrative API client.
 *
 * Mirrors server/src/routes/narrative.ts.
 */
import { api } from "./client";

export interface NarrativeResult {
  summary: string;
  generatedAt: string;
  source: "llm" | "fallback";
  fallbackReason?: string;
}

export const narrativeApi = {
  forCompany: (companyId: string) =>
    api.get<NarrativeResult>(`/companies/${companyId}/narrative`),
  forOutcome: (outcomeId: string) =>
    api.get<NarrativeResult>(`/orchestra/outcomes/${outcomeId}/narrative`),
};
