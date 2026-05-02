import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Empty state primitive — used wherever a list, table, or dialog has
 * nothing to show yet. Centered icon + title + one-line copy + single
 * primary action. Replaces several inline "No requests yet…" messages.
 */
export const EmptyState = ({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) => (
  <div
    className={cn(
      "flex flex-col items-center justify-center text-center px-6 py-12",
      className,
    )}
  >
    {icon && (
      <div className="mb-4 grid place-items-center h-11 w-11 rounded-lg surface-2 border border-border text-muted-foreground">
        {icon}
      </div>
    )}
    <p className="text-body font-medium">{title}</p>
    {description && (
      <p className="text-body text-muted-foreground mt-1 max-w-sm">
        {description}
      </p>
    )}
    {action && <div className="mt-5">{action}</div>}
  </div>
);
