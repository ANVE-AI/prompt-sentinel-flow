import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { useDashboardApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  CheckCircle2, XCircle, Play, ShieldAlert, Filter, RotateCcw, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

type Verdict = "allow" | "flag" | "block" | "sanitize" | "error";
type Expected = "allow" | "flag" | "block" | "sanitize";

interface FiredLayer {
  layer: string;
  verdict: string;
  rule: string | null;
  reason: string | null;
}

interface HarnessResult {
  id: string;
  category: string;
  prompt: string;
  notes: string | null;
  expected: Expected;
  verdict: Verdict;
  passed: boolean;
  detected_intent: string | null;
  fired_layers: FiredLayer[];
  latency_ms: number;
  error?: string;
}

interface HarnessResponse {
  summary: {
    total: number;
    passed: number;
    failed: number;
    by_category: Record<string, { total: number; passed: number }>;
  };
  results: HarnessResult[];
}

const VERDICT_TONE: Record<Verdict, string> = {
  block: "border-destructive/40 text-destructive bg-destructive/10",
  sanitize: "border-amber-500/40 text-amber-500 bg-amber-500/10",
  flag: "border-amber-500/40 text-amber-500 bg-amber-500/10",
  allow: "border-emerald-500/40 text-emerald-500 bg-emerald-500/10",
  error: "border-destructive/40 text-destructive bg-destructive/10",
};

const PolicyHarness = () => {
  const { call } = useDashboardApi();
  const [data, setData] = useState<HarnessResponse | null>(null);
  const [filter, setFilter] = useState<"all" | "failed" | "passed">("all");
  const [category, setCategory] = useState<string>("all");
  const [query, setQuery] = useState("");

  const run = useMutation({
    mutationFn: () => call<HarnessResponse>("run_policy_harness"),
    onSuccess: (r) => {
      setData(r);
      if (r.summary.failed === 0) toast.success(`All ${r.summary.total} cases passed`);
      else toast.warning(`${r.summary.failed} of ${r.summary.total} cases failed`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Harness run failed"),
  });

  const retryOne = useMutation({
    mutationFn: (caseId: string) =>
      call<HarnessResponse>("run_policy_harness", { body: { case_ids: [caseId] } }),
    onSuccess: (r) => {
      if (!data || r.results.length === 0) return;
      const updated = data.results.map((row) =>
        row.id === r.results[0].id ? r.results[0] : row,
      );
      const passed = updated.filter((x) => x.passed).length;
      const by_category: HarnessResponse["summary"]["by_category"] = {};
      for (const x of updated) {
        const k = by_category[x.category] ?? { total: 0, passed: 0 };
        k.total++;
        if (x.passed) k.passed++;
        by_category[x.category] = k;
      }
      setData({
        results: updated,
        summary: { total: updated.length, passed, failed: updated.length - passed, by_category },
      });
    },
  });

  const categories = useMemo(() => {
    const set = new Set<string>(["all"]);
    for (const r of data?.results ?? []) set.add(r.category);
    return Array.from(set);
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.results.filter((r) => {
      if (filter === "failed" && r.passed) return false;
      if (filter === "passed" && !r.passed) return false;
      if (category !== "all" && r.category !== category) return false;
      if (query && !r.prompt.toLowerCase().includes(query.toLowerCase()) && !r.id.includes(query)) return false;
      return true;
    });
  }, [data, filter, category, query]);

  const passRate = data ? Math.round((data.summary.passed / Math.max(1, data.summary.total)) * 100) : null;

  return (
    <div className="px-4 md:px-6 py-5 space-y-5 max-w-6xl mx-auto">
      <PageHeader
        title="Policy test harness"
        description="Run a curated set of known injection, jailbreak, and obfuscation prompts through your live policy. Use before each release to catch evasions."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/dashboard/policies/sandbox">Open sandbox</Link>
            </Button>
            <Button onClick={() => run.mutate()} disabled={run.isPending} size="sm">
              <Play className="h-3.5 w-3.5 mr-1.5" />
              {run.isPending ? "Running…" : data ? "Re-run all" : "Run harness"}
            </Button>
          </div>
        }
      />

      {!data && !run.isPending && (
        <Card className="surface-1 border-border">
          <CardContent className="p-10 text-center space-y-3">
            <ShieldAlert className="h-8 w-8 mx-auto text-muted-foreground" />
            <div className="text-h2 font-medium">No results yet</div>
            <p className="text-meta text-muted-foreground max-w-md mx-auto">
              The harness evaluates a bundled corpus of prompt-injection, jailbreak persona,
              system-prompt extraction, encoded-payload, and multi-turn evasion attempts
              against your active policy settings.
            </p>
            <Button onClick={() => run.mutate()} size="sm" className="mt-2">
              <Play className="h-3.5 w-3.5 mr-1.5" /> Run harness
            </Button>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <div className="grid sm:grid-cols-4 gap-3">
            <Card className={cn(
              "border-border",
              passRate === 100 ? "bg-emerald-500/5 border-emerald-500/30" : "bg-destructive/5 border-destructive/30",
            )}>
              <CardContent className="p-4">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Pass rate</div>
                <div className="text-h1 font-semibold mt-1">{passRate}%</div>
                <div className="text-meta text-muted-foreground mt-0.5">
                  {data.summary.passed}/{data.summary.total} cases
                </div>
              </CardContent>
            </Card>
            <Card className="surface-1 border-border">
              <CardContent className="p-4">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Failed</div>
                <div className="text-h1 font-semibold mt-1 text-destructive">{data.summary.failed}</div>
                <div className="text-meta text-muted-foreground mt-0.5">evasions slipped through</div>
              </CardContent>
            </Card>
            <Card className="surface-1 border-border sm:col-span-2">
              <CardContent className="p-4">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">By category</div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(data.summary.by_category).map(([cat, v]) => {
                    const ok = v.passed === v.total;
                    return (
                      <Badge
                        key={cat}
                        variant="outline"
                        className={cn(
                          "font-mono",
                          ok ? "border-emerald-500/40 text-emerald-500" : "border-destructive/40 text-destructive",
                        )}
                      >
                        {cat} {v.passed}/{v.total}
                      </Badge>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="surface-1 border-border">
            <div className="px-5 py-3 border-b border-border flex items-center gap-2 flex-wrap">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
                <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All cases</SelectItem>
                  <SelectItem value="failed">Failed only</SelectItem>
                  <SelectItem value="passed">Passed only</SelectItem>
                </SelectContent>
              </Select>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{c === "all" ? "All categories" : c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search prompt or id…"
                className="h-8 w-56"
              />
              <div className="ml-auto text-meta text-muted-foreground">
                {filtered.length} of {data.results.length}
              </div>
            </div>
            <ul className="divide-y divide-border">
              {filtered.map((r) => (
                <li key={r.id} className="px-5 py-3.5">
                  <div className="flex items-start gap-3">
                    <div className="pt-0.5">
                      {r.passed ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="font-mono text-meta text-muted-foreground">{r.id}</code>
                        <Badge variant="outline" className="text-[10px]">{r.category}</Badge>
                        <Badge variant="outline" className={cn("text-[10px] font-mono", VERDICT_TONE[r.verdict])}>
                          got: {r.verdict}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] font-mono">
                          expected: {r.expected}
                        </Badge>
                        {r.detected_intent && (
                          <Badge variant="outline" className="text-[10px] font-mono">
                            intent: {r.detected_intent}
                          </Badge>
                        )}
                        <span className="text-meta text-muted-foreground ml-auto">{r.latency_ms}ms</span>
                      </div>
                      <div className="font-mono text-meta whitespace-pre-wrap break-words text-foreground/90 line-clamp-3">
                        {r.prompt}
                      </div>
                      {r.notes && (
                        <div className="text-meta text-muted-foreground italic">{r.notes}</div>
                      )}
                      {r.fired_layers.length > 0 && (
                        <div className="text-meta text-muted-foreground">
                          <span className="text-foreground/70">Fired:</span>{" "}
                          {r.fired_layers.map((l, i) => (
                            <span key={i}>
                              <code className="font-mono text-[11px]">
                                {l.layer}/{l.verdict}{l.rule ? `:${l.rule}` : ""}
                              </code>
                              {i < r.fired_layers.length - 1 ? ", " : ""}
                            </span>
                          ))}
                        </div>
                      )}
                      {!r.passed && (
                        <div className="flex items-start gap-1.5 text-meta text-destructive">
                          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          <span>
                            Expected <strong>{r.expected}</strong> but got <strong>{r.verdict}</strong>
                            {r.error ? ` — ${r.error}` : "."}
                          </span>
                        </div>
                      )}
                    </div>
                    <Button
                      size="sm" variant="ghost"
                      onClick={() => retryOne.mutate(r.id)}
                      disabled={retryOne.isPending}
                      title="Re-run this case"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="px-5 py-10 text-center text-meta text-muted-foreground">
                  No cases match the current filter.
                </li>
              )}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
};

export default PolicyHarness;
