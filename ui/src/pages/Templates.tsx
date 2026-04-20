import { useEffect } from "react";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { CompanyTemplates } from "../components/CompanyTemplates";

export function Templates() {
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([
      { label: "Companies", href: "/companies" },
      { label: "Templates" },
    ]);
  }, [setBreadcrumbs]);

  return <CompanyTemplates />;
}
