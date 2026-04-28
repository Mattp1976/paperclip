/**
 * InstallCompanyButton — the prominent CTA for installing a Clipmart
 * template into the active company.
 *
 * Wraps the install mutation. Props let the parent pass installing state
 * and the action — we keep the visual shell stable.
 */
import { Loader2, CheckCircle2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface InstallCompanyButtonProps {
  installing: boolean;
  installed: boolean;
  onInstall: () => void;
  /** Visual size variant. */
  size?: "sm" | "default";
}

export function InstallCompanyButton({
  installing,
  installed,
  onInstall,
  size = "default",
}: InstallCompanyButtonProps) {
  if (installed) {
    return (
      <Button
        variant="outline"
        size={size}
        disabled
        className="gap-1.5"
      >
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        Installed
      </Button>
    );
  }
  return (
    <Button
      variant="sage-elevated"
      size={size === "default" ? "none" : "sm"}
      onClick={onInstall}
      disabled={installing}
      className={
        size === "default"
          ? "gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold"
          : "gap-1.5"
      }
    >
      {installing ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Wand2 className="h-4 w-4" />
      )}
      {installing ? "Installing…" : "Install company"}
    </Button>
  );
}
