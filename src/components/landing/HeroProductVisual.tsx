import { useEffect, useState } from "react";
import { ShieldAlert, Ban, Flag, Activity, Sparkles } from "lucide-react";

// Hero product visual — a stylised mock of /dashboard/threats with animated
// counters + a live-feeling attack stream. Pure JSX/SVG, no heavy
// dependencies. Designed to feel like a real product screenshot from across
// the room while being lighter than an actual image.
//
// Animations are done via keyframes already in Tailwind (animate-pulse, custom
// fade-in classes from globals.css) plus a small useEffect that ticks the
// counter values. Respects prefers-reduced-motion via the CSS classes.

const ATTACK_STREAM = [
  { kind: "DAN persona", layer: "keywords",       severity: "block" },
  { kind: "ZWSP smuggle", layer: "unicode",       severity: "block" },
  { kind: "Grandma prompt", layer: "narrative",   severity: "block" },
  { kind: "Multi-turn priming", layer: "behavioral", severity: "flag"  },
  { kind: "Photoreal+figure", layer: "deepfake",  severity: "flag"  },
  { kind: "French jailbreak", layer: "keywords",  severity: "block" },
  { kind: "PII: credit_card", layer: "pii",       severity: "sanitize" },
  { kind: "Encoded base64", layer: "heuristics",  severity: "block" },
  { kind: "Tag-char smuggle", layer: "unicode",   severity: "block" },
  { kind: "Construction+harm", layer: "narrative", severity: "block" },
] as const;

const SEVERITY_TONE: Record<string, string> = {
  block: "text-status-block bg-status-block/10 border-status-block/30",
  flag: "text-status-warn bg-status-warn/10 border-status-warn/30",
  sanitize: "text-status-info bg-status-info/10 border-status-info/30",
};

function useTicker(targetMs = 3500): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((v) => v + 1), targetMs);
    return () => clearInterval(id);
  }, [targetMs]);
  return n;
}

function useCountUp(target: number, durationMs = 1200): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      // Ease-out cubic for a satisfying counter feel.
      const eased = 1 - Math.pow(1 - p, 3);
      setV(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return v;
}

export function HeroProductVisual() {
  const tick = useTicker(2500);
  // Cycle through the attack stream — show the most recent 6 entries with
  // the newest at the top, so the page feels live without refetching.
  const recent = Array.from({ length: 6 }, (_, i) =>
    ATTACK_STREAM[(tick + i) % ATTACK_STREAM.length],
  );
  const totalReq = useCountUp(48_293);
  const blocked = useCountUp(1247);
  const blockRate = useCountUp(258); // 2.58% — divide by 100 for display

  return (
    <div className="relative" aria-hidden="true">
      {/* Glow backdrop — subtle radial; respects reduced-motion via no animation. */}
      <div className="pointer-events-none absolute inset-0 -z-10 mx-auto max-w-3xl">
        <div className="absolute inset-x-10 top-10 bottom-10 rounded-3xl bg-primary/5 blur-3xl" />
      </div>

      {/* Faux app frame */}
      <div className="mx-auto max-w-3xl rounded-xl border border-border surface-1 shadow-[0_30px_80px_-30px_hsl(var(--primary)/0.25)] overflow-hidden">
        {/* Faux titlebar */}
        <div className="flex items-center gap-2 px-3 h-9 border-b border-border bg-surface-2">
          <span className="h-2.5 w-2.5 rounded-full bg-status-block/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-status-warn/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-status-ok/60" />
          <div className="ml-3 inline-flex items-center gap-1.5 text-meta text-muted-foreground font-mono">
            <ShieldAlert className="h-3 w-3" />
            anveguard / dashboard / threats
          </div>
          <div className="ml-auto inline-flex items-center gap-1.5 px-2 h-5 rounded border border-border bg-surface-1 text-[10px] font-mono text-status-warn">
            <span className="h-1.5 w-1.5 rounded-full bg-status-warn animate-pulse" />
            12 blocked · 24h
          </div>
        </div>

        {/* Hero status banner */}
        <div className="px-5 py-4 border-b border-border bg-status-block/5">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-status-block/15 text-status-block">
              <Ban className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold tabular-nums">
                {blocked.toLocaleString()} requests blocked
              </div>
              <div className="text-meta text-muted-foreground">
                Engine intercepted {blocked.toLocaleString()} blocked + 87 flagged across {totalReq.toLocaleString()} requests
                · {(blockRate / 100).toFixed(2)}% block rate
              </div>
            </div>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
          <Kpi label="Total requests" icon={Activity} value={totalReq.toLocaleString()} tone="muted" />
          <Kpi label="Blocked" icon={Ban} value={blocked.toLocaleString()} tone="block" />
          <Kpi label="Flagged" icon={Flag} value="87" tone="warn" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_180px]">
          {/* Sparkline area chart — pure SVG, no recharts dep on the landing page */}
          <div className="px-5 py-4 border-b md:border-b-0 md:border-r border-border">
            <div className="mb-2 flex items-center justify-between text-meta text-muted-foreground">
              <span className="font-mono uppercase tracking-[0.1em]">activity · 24h</span>
              <span className="tabular-nums">peak 142/h · 14:00</span>
            </div>
            <ActivitySparkline />
          </div>

          {/* Live attack stream */}
          <div className="px-3 py-3">
            <div className="mb-2 flex items-center justify-between text-meta text-muted-foreground px-1">
              <span className="font-mono uppercase tracking-[0.1em]">live</span>
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-status-block animate-pulse" />
                streaming
              </span>
            </div>
            <ul className="space-y-1.5">
              {recent.map((a, i) => (
                <li
                  key={`${tick}-${i}`}
                  className={`text-meta px-2 py-1 rounded border ${SEVERITY_TONE[a.severity]} animate-fade-in`}
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono truncate">{a.kind}</span>
                    <span className="text-[9px] uppercase tracking-wider opacity-80">{a.severity}</span>
                  </div>
                  <div className="text-[10px] opacity-70 font-mono">via {a.layer}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer hint — gives the visual a sense of being clickable */}
        <div className="px-5 py-2.5 border-t border-border bg-surface-2 text-meta text-muted-foreground flex items-center gap-2">
          <Sparkles className="h-3 w-3 text-primary" />
          Updates every 60s · click any row to see the full payload
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label, icon: Icon, value, tone,
}: {
  label: string;
  icon: typeof Activity;
  value: string;
  tone: "muted" | "block" | "warn";
}) {
  const toneClass =
    tone === "block" ? "text-status-block" :
    tone === "warn"  ? "text-status-warn" :
                       "text-muted-foreground";
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between text-meta text-muted-foreground">
        <span>{label}</span>
        <Icon className={`h-3.5 w-3.5 ${toneClass}`} />
      </div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${toneClass === "text-muted-foreground" ? "text-foreground" : toneClass}`}>
        {value}
      </div>
    </div>
  );
}

// Hand-rolled sparkline — 60 data points, animates a sweep on mount via
// stroke-dasharray. SVG path is generated once from a deterministic noise
// pattern so it looks like real traffic without flickering on re-render.
const POINTS = (() => {
  const xs = Array.from({ length: 60 });
  const ys = xs.map((_, i) => {
    const base = 40 + Math.sin(i / 8) * 18;
    const noise = Math.sin(i * 1.7) * 8 + Math.cos(i * 0.9) * 5;
    const peak = Math.max(0, 35 - Math.abs(i - 32)) * 1.2;
    return Math.max(8, Math.min(78, base + noise + peak));
  });
  return ys.map((y, i) => `${(i / 59) * 100},${80 - y}`);
})();
const PATH_D = `M ${POINTS[0]} L ${POINTS.slice(1).join(" L ")}`;
const FILL_D = `${PATH_D} L 100,80 L 0,80 Z`;

function ActivitySparkline() {
  return (
    <svg
      viewBox="0 0 100 80"
      preserveAspectRatio="none"
      className="block w-full h-28"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="hero-spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="hsl(var(--primary))" stopOpacity="0.35" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={FILL_D} fill="url(#hero-spark-fill)" />
      <path
        d={PATH_D}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
