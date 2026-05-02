import { cn } from "@/lib/utils";

const tone: Record<string, string> = {
  ok: "bg-status-ok shadow-[0_0_0_3px_hsl(var(--status-ok)/0.2)]",
  warn: "bg-status-warn shadow-[0_0_0_3px_hsl(var(--status-warn)/0.2)]",
  block: "bg-status-block shadow-[0_0_0_3px_hsl(var(--status-block)/0.2)]",
  info: "bg-status-info shadow-[0_0_0_3px_hsl(var(--status-info)/0.2)]",
  neutral: "bg-muted-foreground shadow-[0_0_0_3px_hsl(var(--muted-foreground)/0.18)]",
};

/**
 * 8px status dot with a soft 3px halo.
 * `live` adds the keyframe pulse used by the topbar's "requests/min" indicator.
 */
export const StatusDot = ({
  status = "ok",
  live = false,
  className,
}: {
  status?: keyof typeof tone;
  live?: boolean;
  className?: string;
}) => (
  <span
    aria-hidden
    className={cn(
      "inline-block h-2 w-2 rounded-full",
      tone[status] ?? tone.neutral,
      live && "live-pulse",
      className,
    )}
  />
);
