import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Loading primitives shared across dashboard pages.
 *
 * Why this file exists: every dashboard table/card was rolling its own
 * "Skeleton h-9, h-9, h-9" or single tall block, which created loading
 * flashes that didn't match the final layout. These primitives keep the
 * spinner-shaped grey blocks visually identical to the resolved content,
 * so pages don't visibly reflow on first paint.
 *
 * Usage:
 *   <SkeletonRows rows={6} cols={tableCols} />        // table-shaped
 *   <SkeletonBlock variant="kpi" />                   // big stat hero
 *   <SkeletonBlock variant="chart" className="h-64" />
 *   <SkeletonBlock variant="card" />                  // generic card body
 */

export const SkeletonRows = ({
  rows = 5,
  cols,
  rowClassName,
  className,
}: {
  rows?: number;
  /** Tailwind grid-cols arbitrary value, e.g. "grid-cols-[150px_1fr_140px]". */
  cols: string;
  rowClassName?: string;
  className?: string;
}) => (
  <ul
    className={cn("divide-y divide-border", className)}
    aria-busy="true"
    aria-live="polite"
  >
    {Array.from({ length: rows }).map((_, i) => (
      <li
        key={i}
        className={cn(
          "grid gap-3 px-4 h-9 items-center",
          cols,
          rowClassName,
        )}
      >
        {/* One skeleton per column. We render a generic bar; the column
            template controls width so cells line up with the real header. */}
        {Array.from({ length: countCols(cols) }).map((__, c) => (
          <Skeleton
            key={c}
            className={cn(
              "h-3 rounded-sm",
              // Vary widths slightly so the row doesn't look like a barcode.
              c === 0 ? "w-24" : c === 1 ? "w-3/4" : c === countCols(cols) - 1 ? "w-12" : "w-16",
            )}
          />
        ))}
      </li>
    ))}
  </ul>
);

export const SkeletonBlock = ({
  variant = "card",
  className,
}: {
  variant?: "kpi" | "chart" | "card";
  className?: string;
}) => {
  if (variant === "kpi") {
    return (
      <div
        className={cn(
          "rounded-lg border border-border surface-1 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr_1fr_1fr] divide-y lg:divide-y-0 lg:divide-x divide-border overflow-hidden",
          className,
        )}
        aria-busy="true"
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="p-5 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
    );
  }
  if (variant === "chart") {
    return (
      <div
        className={cn(
          "rounded-lg border border-border surface-1 p-5 space-y-3",
          className,
        )}
        aria-busy="true"
      >
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  // Generic card body (used inside an existing <Card>).
  return (
    <div className={cn("p-5 space-y-3", className)} aria-busy="true">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
};

// Count the number of comma-separated tracks inside `grid-cols-[...]`.
// Falls back to 4 when the template can't be parsed (e.g. utility class).
function countCols(cols: string): number {
  const m = cols.match(/grid-cols-\[(.+)\]/);
  if (!m) return 4;
  // Split on underscores (Tailwind's arbitrary-value spacer for spaces).
  return m[1].split("_").length;
}
