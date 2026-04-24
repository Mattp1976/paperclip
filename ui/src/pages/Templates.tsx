import { useEffect, useState } from "react";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { CompanyTemplates } from "../components/CompanyTemplates";
import { FleetTemplates } from "../components/FleetTemplates";
import { cn } from "@/lib/utils";

type Tab = "company" | "team";

export function Templates() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const [tab, setTab] = useState<Tab>("company");

  useEffect(() => {
    setBreadcrumbs([
      { label: "Companies", href: "/companies" },
      { label: "Templates" },
    ]);
  }, [setBreadcrumbs]);

  return (
    <div className="px-4">
      <div className="mb-4 flex items-center gap-1 border-b border-border">
        <TabButton active={tab === "company"} onClick={() => setTab("company")}>
          New company
        </TabButton>
        <TabButton active={tab === "team"} onClick={() => setTab("team")}>
          Starter team
        </TabButton>
      </div>
      {tab === "company" ? <CompanyTemplates /> : <FleetTemplates />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative px-3 py-2 text-sm transition-colors",
        active
          ? "text-foreground font-medium"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
      {active && (
        <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />
      )}
    </button>
  );
}
