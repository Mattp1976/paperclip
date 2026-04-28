/**
 * OutcomeNarrative — narrative for a single outcome's current state.
 *
 * Calls /orchestra/outcomes/:id/narrative on a 30s poll while the
 * outcome is still in flight. Replaces the structured-events panel
 * the page used in Sprint 2.
 */
import { useQuery } from "@tanstack/react-query";
import { narrativeApi } from "@/api/narrative";
import { NarrativePanel } from "./NarrativePanel";

interface OutcomeNarrativeProps {
  outcomeId: string;
}

export function OutcomeNarrative({ outcomeId }: OutcomeNarrativeProps) {
  const query = useQuery({
    queryKey: ["narrative", "outcome", outcomeId] as const,
    queryFn: () => narrativeApi.forOutcome(outcomeId),
    enabled: !!outcomeId,
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
