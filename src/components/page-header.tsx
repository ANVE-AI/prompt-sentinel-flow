import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Standardized page header used at the top of every dashboard page.
 * Replaces the ad-hoc `<h1 className="text-2xl ...">` + paragraph pattern
 * so density and rhythm stay consistent across pages.
 */
export const PageHeader = ({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) => (
  <div className={cn("flex items-start justify-between gap-6 pb-1", className)}>
    <div className="min-w-0">
      <h1 className="text-h1 font-semibold tracking-tight">{title}</h1>
      {description && (
        <p className="text-body text-muted-foreground mt-1 max-w-2xl">{description}</p>
      )}
    </div>
    {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
  </div>
);
