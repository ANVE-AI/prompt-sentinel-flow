import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, ArrowRight, Plug, KeyRound, Sparkles, ShieldCheck, PartyPopper } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardApi } from "@/lib/api";

/**
 * Progress-aware "next best step" card.
 *
 * Reads the user's current state (endpoints, active keys, recent traffic,
 * configured policy rules) and surfaces a single actionable suggestion plus
 * a 4-pip checklist. The whole point is to replace the static "How to use"
 * intro with a card that always tells you the *one* thing to do next.
 *
 * Each step is ordered: configure endpoint → create key → send first
 * request → tune at least one policy rule. Once everything is done we show
 * a celebratory state with a pointer to logs/policies for ongoing tuning.
 */
type StepKey = "endpoint" | "key" | "traffic" | "policy" | "done";

type StepDef = {
  key: StepKey;
  label: string;
  title: string;
  body: string;
  cta: string;
  to: string;
  icon: typeof Plug;
};

const STEP_DEFS: StepDef[] = [
  {
    key: "endpoint",
    label: "Add endpoint",
    title: "Add your first upstream endpoint",
    body: "Tell AnveGuard which provider to guard (OpenAI, Anthropic, Perplexity, your own host). Your provider key is stored once here — clients never see it.",
    cta: "Open Endpoints",
    to: "/dashboard/endpoints",
    icon: Plug,
  },
  {
    key: "key",
    label: "Create key",
    title: "Generate an AnveGuard API key",
    body: "Bind a key to your endpoint. Apps use the ag_live_… secret as a Bearer token — only the hash is stored, so copy it once when shown.",
    cta: "Open Keys",
    to: "/dashboard/keys",
    icon: KeyRound,
  },
  {
    key: "traffic",
    label: "Send a request",
    title: "Send your first guarded request",
    body: "Try it live in the Playground (or copy the curl from your endpoint). You'll see every policy layer decide in real time.",
    cta: "Open Playground",
    to: "/dashboard/playground",
    icon: Sparkles,
  },
  {
    key: "policy",
    label: "Tune policies",
    title: "Add a policy rule",
    body: "Default heuristics are on, but a single keyword or regex rule tailored to your workload makes verdicts dramatically more useful.",
    cta: "Open Policies",
    to: "/dashboard/policies",
    icon: ShieldCheck,
  },
];

export function NextStepCard() {
  const { call } = useDashboardApi();

  // These queries are already used elsewhere in the dashboard, so
  // react-query dedupes — no extra requests in practice.
  const { data: endpointsData } = useQuery({
    queryKey: ["endpoints"],
    queryFn: () => call<any>("list_endpoints"),
  });
  const { data: keysData } = useQuery({
    queryKey: ["keys"],
    queryFn: () => call<any>("list_keys"),
  });
  const { data: logsData } = useQuery({
    queryKey: ["logs", "recent"],
    queryFn: () => call<any>("list_logs", { query: { limit: "6" } }),
  });
  const { data: rulesData } = useQuery({
    queryKey: ["policy_rules"],
    queryFn: () => call<any>("list_policy_rules"),
  });

  const progress = useMemo(() => {
    const hasEndpoint = (endpointsData?.endpoints?.length ?? 0) > 0;
    const activeKeys = ((keysData?.keys ?? []) as any[]).filter((k) => k.is_active);
    const hasKey = activeKeys.length > 0;
    const recentLogs = (logsData?.logs ?? logsData?.items ?? []) as any[];
    const lastRequestAt: string | null = recentLogs[0]?.created_at ?? null;
    const hasTraffic = recentLogs.length > 0;
    const hasPolicyRule = ((rulesData?.rules ?? rulesData?.items ?? []) as any[]).length > 0;
    return {
      hasEndpoint,
      hasKey,
      hasTraffic,
      hasPolicyRule,
      activeKeyCount: activeKeys.length,
      endpointCount: endpointsData?.endpoints?.length ?? 0,
      lastRequestAt,
    };
  }, [endpointsData, keysData, logsData, rulesData]);

  const completion: Record<StepKey, boolean> = {
    endpoint: progress.hasEndpoint,
    key: progress.hasKey,
    traffic: progress.hasTraffic,
    policy: progress.hasPolicyRule,
    done: false,
  };

  const next = STEP_DEFS.find((s) => !completion[s.key]) ?? null;
  const allDone = !next;
  const completedCount = STEP_DEFS.filter((s) => completion[s.key]).length;

  return (
    <Card className="surface-1 border-border overflow-hidden">
      <div className="p-5 flex items-start gap-4">
        <div
          className={cn(
            "rounded-md p-2.5 shrink-0",
            allDone ? "bg-status-ok/15 text-status-ok" : "bg-primary/10 text-primary",
          )}
        >
          {allDone ? <PartyPopper className="h-5 w-5" /> : (() => {
            const Icon = next!.icon;
            return <Icon className="h-5 w-5" />;
          })()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <span>Setup progress</span>
            <span className="font-mono">{completedCount}/{STEP_DEFS.length}</span>
          </div>
          <div className="text-base font-semibold mt-0.5">
            {allDone ? "You're fully set up" : next!.title}
          </div>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            {allDone
              ? renderDoneSummary(progress)
              : next!.body}
          </p>

          {/* Checklist row */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {STEP_DEFS.map((s) => {
              const done = completion[s.key];
              const isNext = !done && next?.key === s.key;
              return (
                <span
                  key={s.key}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] border",
                    done && "border-status-ok/40 bg-status-ok/10 text-status-ok",
                    isNext && "border-primary/50 bg-primary/10 text-primary",
                    !done && !isNext && "border-border text-muted-foreground",
                  )}
                  title={done ? `${s.label} — done` : isNext ? `${s.label} — next` : `${s.label} — todo`}
                >
                  {done ? <Check className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-current opacity-50" />}
                  {s.label}
                </span>
              );
            })}
          </div>
        </div>

        <div className="shrink-0 flex flex-col gap-2 self-center">
          {allDone ? (
            <>
              <Button asChild size="sm" variant="outline">
                <Link to="/dashboard/logs">
                  Inspect logs
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link to="/dashboard/policies">
                  Tune policies
                </Link>
              </Button>
            </>
          ) : (
            <Button asChild size="sm">
              <Link to={next!.to}>
                {next!.cta}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function renderDoneSummary(p: {
  endpointCount: number;
  activeKeyCount: number;
  lastRequestAt: string | null;
}): string {
  const parts: string[] = [];
  parts.push(`${p.endpointCount} endpoint${p.endpointCount === 1 ? "" : "s"}`);
  parts.push(`${p.activeKeyCount} active key${p.activeKeyCount === 1 ? "" : "s"}`);
  if (p.lastRequestAt) {
    const d = new Date(p.lastRequestAt);
    if (!Number.isNaN(d.getTime())) {
      parts.push(`last request ${formatAgo(d)}`);
    }
  }
  return `Endpoints, keys, traffic, and at least one policy rule are configured (${parts.join(" · ")}). Keep an eye on logs and adjust rules as your workload evolves.`;
}

function formatAgo(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}
