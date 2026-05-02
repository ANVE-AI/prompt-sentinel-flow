import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SkeletonBlock } from "@/components/skeletons";
import { EmptyState } from "@/components/empty-state";
import { Plug, Plus, Server, KeyRound, ChevronRight, ShieldCheck, ShieldAlert } from "lucide-react";
import { useDashboardApi } from "@/lib/api";

interface EndpointRow {
  id: string;
  name: string;
  base_url: string;
  kind: string;
  default_model: string | null;
  has_key: boolean;
  key_count?: number;
  is_shared?: boolean;
}

const KIND_LABELS: Record<string, string> = {
  openai_compatible: "OpenAI-compatible",
  anthropic: "Anthropic-compatible",
};

function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return url; }
}

const Providers = () => {
  const { call } = useDashboardApi();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["endpoints"],
    queryFn: () => call<{ endpoints: EndpointRow[]; shared_endpoints?: EndpointRow[] }>("list_endpoints"),
  });

  const grouped = useMemo(() => {
    const all = [
      ...(data?.endpoints ?? []),
      ...(data?.shared_endpoints ?? []).map((e) => ({ ...e, is_shared: true })),
    ];
    const groups = new Map<string, EndpointRow[]>();
    for (const e of all) {
      const k = e.kind || "openai_compatible";
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(e);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [data]);

  const totalEndpoints = (data?.endpoints?.length ?? 0) + (data?.shared_endpoints?.length ?? 0);
  const totalKeys = (data?.endpoints ?? []).reduce((sum, e) => sum + (e.key_count ?? 0), 0);
  const withCreds = (data?.endpoints ?? []).filter((e) => e.has_key).length;

  return (
    <div className="px-4 md:px-6 py-6 space-y-5 max-w-7xl mx-auto">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Upstream</div>
          <h1 className="text-h1 font-semibold mt-0.5">Providers</h1>
          <p className="text-body text-muted-foreground mt-1 max-w-2xl">
            All upstream LLM providers your proxy can reach, grouped by API shape.
            Configure credentials, default models, and routing here.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => navigate("/dashboard/endpoints")}>
            <Plug className="h-3.5 w-3.5 mr-1.5" /> Manage endpoints
          </Button>
          <Button size="sm" onClick={() => navigate("/dashboard/endpoints?new=1")}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> New endpoint
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {isLoading ? (
          <SkeletonBlock variant="kpi" />
        ) : (
          <>
            <Kpi label="Endpoints" value={totalEndpoints} />
            <Kpi label="With credentials" value={`${withCreds} / ${data?.endpoints?.length ?? 0}`} />
            <Kpi label="Bound API keys" value={totalKeys} />
            <Kpi label="Provider types" value={grouped.length} />
          </>
        )}
      </div>

      {isLoading ? (
        <Card className="surface-1 border-border p-5">
          <SkeletonBlock variant="card" />
        </Card>
      ) : totalEndpoints === 0 ? (
        <Card className="surface-1 border-border">
          <EmptyState
            icon={<Server className="h-5 w-5" />}
            title="No upstream providers yet"
            description="Add an endpoint to start proxying requests to OpenAI, Anthropic, OpenRouter, or any compatible provider."
            action={
              <Button size="sm" onClick={() => navigate("/dashboard/endpoints?new=1")}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> New endpoint
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {grouped.map(([kind, eps]) => (
            <section key={kind}>
              <div className="flex items-baseline justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground font-mono">
                    {kind}
                  </span>
                  <span className="text-h2 font-medium text-foreground">
                    {KIND_LABELS[kind] ?? kind}
                  </span>
                </div>
                <span className="text-meta text-muted-foreground">{eps.length} endpoint{eps.length === 1 ? "" : "s"}</span>
              </div>
              <Card className="surface-1 border-border overflow-hidden">
                <ul className="divide-y divide-border">
                  {eps.map((e) => (
                    <li
                      key={e.id}
                      className="px-4 md:px-5 py-3.5 flex items-center gap-4 hover:bg-surface-2/50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/dashboard/endpoints?focus=${e.id}`)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-body font-medium truncate">{e.name}</span>
                          {e.is_shared && <Badge status="neutral">shared</Badge>}
                          {e.has_key ? (
                            <Badge status="ok">
                              <ShieldCheck className="h-3 w-3 mr-1" /> credentials
                            </Badge>
                          ) : (
                            <Badge status="warn">
                              <ShieldAlert className="h-3 w-3 mr-1" /> no credentials
                            </Badge>
                          )}
                        </div>
                        <div className="text-meta text-muted-foreground font-mono truncate mt-0.5">
                          {hostOf(e.base_url)}
                          {e.default_model && <span className="ml-2">· default: {e.default_model}</span>}
                        </div>
                      </div>
                      <div className="hidden sm:flex items-center gap-1.5 text-meta text-muted-foreground shrink-0">
                        <KeyRound className="h-3.5 w-3.5" />
                        <span className="tabular-nums">{e.key_count ?? 0}</span>
                        <span>key{(e.key_count ?? 0) === 1 ? "" : "s"}</span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

const Kpi = ({ label, value }: { label: string; value: number | string }) => (
  <Card className="surface-1 border-border px-4 py-3">
    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className="text-h2 font-semibold mt-0.5 tabular-nums">{value}</div>
  </Card>
);

export default Providers;
