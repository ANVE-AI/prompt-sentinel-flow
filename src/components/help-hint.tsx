import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Small (i) icon next to a label that opens a tooltip with a one-liner.
 * Use sparingly — only on controls whose meaning isn't obvious from the label.
 */
export function HelpHint({
  children,
  className,
  side = "top",
}: {
  children: ReactNode;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="More info"
          className={cn(
            "inline-flex items-center justify-center rounded-sm text-muted-foreground/70 hover:text-foreground transition-colors align-middle",
            className,
          )}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-xs text-xs leading-relaxed">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}
