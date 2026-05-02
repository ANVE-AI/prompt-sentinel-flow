import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Compact label/value pair used in detail sheets and dialogs.
 * Replaces the repeated
 *   <div><div className="text-xs text-muted-foreground">…</div><div>…</div></div>
 * pattern. Values default to monospace so IDs / models / latencies align.
 */
export const KeyValue = ({
  label,
  children,
  mono = true,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  mono?: boolean;
  className?: string;
}) => (
  <div className={cn("min-w-0", className)}>
    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
      {label}
    </div>
    <div
      className={cn(
        "mt-1 text-body text-foreground break-words",
        mono && "font-mono text-xs",
      )}
    >
      {children}
    </div>
  </div>
);
