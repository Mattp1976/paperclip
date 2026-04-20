import { Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  message: string;
  description?: string;
  action?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, message, description, action, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="rounded-2xl bg-stone-100/80 dark:bg-muted/40 p-5 mb-5">
        <Icon className="h-10 w-10 text-stone-400 dark:text-muted-foreground/40" strokeWidth={1.5} />
      </div>
      <p className="text-sm font-medium text-muted-foreground mb-1">{message}</p>
      {description && (
        <p className="text-xs text-muted-foreground/60 max-w-xs mb-4">{description}</p>
      )}
      {!description && <div className="mb-3" />}
      {action && onAction && (
        <Button onClick={onAction} size="sm" variant="outline" className="rounded-lg shadow-sm">
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          {action}
        </Button>
      )}
    </div>
  );
}
