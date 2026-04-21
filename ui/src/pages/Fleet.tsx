import { useEffect } from "react";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { FleetAnalytics } from "../components/FleetAnalytics";
import { FleetHealthOverview } from "../components/FleetHealthOverview";
import { AgentLeaderboard } from "../components/AgentLeaderboard";
import { BulkAgentOps } from "../components/BulkAgentOps";
import { PageHeader } from "../components/PageHeader";
import { RunHistoryChart } from "../components/RunHistoryChart";

export function Fleet() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => {
    setBreadcrumbs([{ label: "Fleet" }]);
  }, [setBreadcrumbs]);

  if (!selectedCompanyId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Select a company to view fleet analytics.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fleet"
        subtitle="Health, throughput, and leaderboards across every agent in this company."
      />
      <FleetHealthOverview companyId={selectedCompanyId} />
      <RunHistoryChart companyId={selectedCompanyId} />
      <AgentLeaderboard companyId={selectedCompanyId} />
      <BulkAgentOps companyId={selectedCompanyId} />
      <FleetAnalytics companyId={selectedCompanyId} />
    </div>
  );
}
