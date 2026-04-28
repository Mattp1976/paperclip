/**
 * DashboardNarrative — company-level narrative for the dashboard hero.
 *
 * Calls /companies/:id/narrative on a 30-second poll. Falls back
 * cleanly if the server returns a fallback (e.g. no LLM credits).
 */
import { useQuery } from "@tanstack/react-query";
import { narrativeApi } from "@/api/narrative";
import { NarrativePanel } from "./NarrativePanel";

interface DashboardNarrativeProps {
  companyId: string;
}

export function DashboardNarrative({ companyId }: DashboardNarrativeProps) {
  const query = useQuery({
    queryKey: ["narrative", "company", companyId] as const,
    queryFn: () => narrativeApi.forCompany(companyId),
    enabled: !!companyId,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });

  return (
    <NarrativePanel
      heading="What's happening"
      result={query.data}
      loading={query.isLoading}
      error={query.error}
    />
  );
}
