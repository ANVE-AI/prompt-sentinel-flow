import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Two badge styles in this app:
 *
 *   `variant`  — original solid pills (default, secondary, destructive, outline)
 *   `status`   — the new dot-led status chip used in dense data rows
 *                (logs, audit log, dialogs). Each status has its own dot
 *                color but neutral chip background, which keeps long log
 *                lists calm instead of striped with color.
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium leading-4 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        outline: "text-foreground border-border",
      },
      status: {
        ok: "border-border-strong bg-surface-2 text-foreground",
        warn: "border-border-strong bg-surface-2 text-foreground",
        block: "border-border-strong bg-surface-2 text-foreground",
        info: "border-border-strong bg-surface-2 text-foreground",
        neutral: "border-border bg-surface-2 text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

const dotColor: Record<string, string> = {
  ok: "bg-status-ok",
  warn: "bg-status-warn",
  block: "bg-status-block",
  info: "bg-status-info",
  neutral: "bg-muted-foreground",
};

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, status, children, ...props }: BadgeProps) {
  return (
    <div
      className={cn(badgeVariants({ variant: status ? undefined : variant, status }), className)}
      {...props}
    >
      {status && (
        <span
          aria-hidden
          className={cn("h-1.5 w-1.5 rounded-full shrink-0", dotColor[status] ?? "bg-muted-foreground")}
        />
      )}
      {children}
    </div>
  );
}

export { Badge, badgeVariants };
