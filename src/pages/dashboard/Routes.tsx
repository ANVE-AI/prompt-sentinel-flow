import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonRows } from "@/components/skeletons";
import { EmptyState } from "@/components/empty-state";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, GitBranch, Trash2, ArrowDown, ArrowUp, Copy, Pencil,
} from "lucide-react";
import { useDashboardApi } from "@/lib/api";
import { toast } from "sonner";

interface RouteStep { id?: string; position: number; endpoint_id: string; model: string }
interface RouteRow {
  id: string;
  name: string;
  description: string | null;
  fallback_on_5xx: boolean;
  fallback_on_429: boolean;
  fallback_on_timeout: boolean;
  timeout_ms: number;
  created_at: string;
  steps: RouteStep[];
}

interface FormState {
  id?: string;
  name: string;
  description: string;
  fallback_on_5xx: boolean;
  fallback_on_429: boolean;
  fallback_on_timeout: boolean;
  timeout_ms: number;
  steps: { endpoint_id: string; model: string }[];
}

const empty: FormState = {
  name: "",
  description: "",
  fallback_on_5xx: true,
  fallback_on_429: true,
  fallback_on_timeout: false,
  timeout_ms: 30000,
  steps: [{ endpoint_id: "", model: "" }],
};

const Routes = () => {
  const { call } = useDashboardApi();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["routes"],
    queryFn: () => call<{ routes: RouteRow[] }>("list_routes"),
  });
  const { data: epData } = useQuery({
    queryKey: ["endpoints"],
    queryFn: () => call<{ endpoints: any[] }>("list_endpoints"),
  });
  const endpoints = epData?.endpoints ?? [];
  const epById = useMemo(
    () => new Map(endpoints.map((e: any) => [e.id, e])),
    [endpoints],
  );

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [confirmDelete, setConfirmDelete] = useState<RouteRow | null>(null);

  const startCreate = () => { setForm(empty); setOpen(true); };
  const startEdit = (r: RouteRow) => {
    setForm({
      id: r.id,
      name: r.name,
      description: r.description ?? "",
      fallback_on_5xx: r.fallback_on_5xx,
      fallback_on_429: r.fallback_on_429,
      fallback_on_timeout: r.fallback_on_timeout,
      timeout_ms: r.timeout_ms,
      steps: r.steps.map((s) => ({ endpoint_id: s.endpoint_id, model: s.model })),
    });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: () => call("save_route", { body: { ...form, steps: form.steps } }),
    onSuccess: () => {
      toast.success(form.id ? "Route updated" : "Route created");
      qc.invalidateQueries({ queryKey: ["routes"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save route"),
  });
  const del = useMutation({
    mutationFn: (id: string) => call("delete_route", { body: { id } }),
    onSuccess: () => {
      toast.success("Route deleted");
      qc.invalidateQueries({ queryKey: ["routes"] });
      setConfirmDelete(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to delete route"),
  });

  const moveStep = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= form.steps.length) return;
    const next = [...form.steps];
    [next[i], next[j]] = [next[j], next[i]];
    setForm({ ...form, steps: next });
  };

  const validateForm = (): string | null => {
    if (!form.name.trim()) return "Name is required";
    if (form.steps.length === 0) return "Add at least one step";
    for (const [i, s] of form.steps.entries()) {
      if (!s.endpoint_id) return `Step ${i + 1}: pick an endpoint`;
      if (!s.model.trim()) return `Step ${i + 1}: enter a model id`;
    }
    return null;
  };

  return (
    <div className="px-4 md:px-6 py-6 space-y-5 max-w-7xl mx-auto">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Routing
          </div>
          <h1 className="text-h1 font-semibold mt-0.5">Routes</h1>
          <p className="text-body text-muted-foreground mt-1 max-w-2xl">
            Named fallback chains. Call the proxy with{" "}
            <code className="font-mono text-foreground">model: "route:&lt;name&gt;"</code>{" "}
            and the proxy walks each step in order, falling back on the triggers you choose.
          </p>
        </div>
        <Button onClick={startCreate} size="sm">
          <Plus className="h-3.5 w-3.5 mr-1.5" /> New route
        </Button>
      </div>

      <Card className="surface-1 border-border">
        {isLoading ? (
          <SkeletonRows rows={4} cols="grid-cols-[1fr_2fr_120px_auto]" />
        ) : !data?.routes?.length ? (
          <EmptyState
            icon={<GitBranch className="h-5 w-5" />}
            title="No routes yet"
            description="Create a route to fan out across multiple providers with automatic fallback."
            action={<Button onClick={startCreate} size="sm"><Plus className="h-3.5 w-3.5 mr-1.5" />New route</Button>}
          />
        ) : (
          <ul className="divide-y divide-border">
            {data.routes.map((r) => (
              <li key={r.id} className="px-5 py-4 hover:bg-surface-2/40 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-body font-medium">{r.name}</span>
                      <code className="text-meta font-mono text-muted-foreground bg-surface-2 border border-border rounded px-1.5 py-0.5">
                        route:{r.name}
                      </code>
                      <Badge status="neutral">{r.steps.length} step{r.steps.length === 1 ? "" : "s"}</Badge>
                    </div>
                    {r.description && (
                      <div className="text-meta text-muted-foreground mt-1">{r.description}</div>
                    )}
                    <div className="mt-2.5 flex flex-col gap-1">
                      {r.steps.map((s, i) => {
                        const ep = epById.get(s.endpoint_id);
                        return (
                          <div key={s.id ?? i} className="flex items-center gap-2 text-meta">
                            <span className="font-mono text-muted-foreground w-5 text-right">{i + 1}.</span>
                            <span className="font-medium text-foreground">{ep?.name ?? "(missing endpoint)"}</span>
                            <span className="text-muted-foreground">→</span>
                            <code className="font-mono text-muted-foreground">{s.model}</code>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2.5 flex items-center gap-1.5 flex-wrap text-meta text-muted-foreground">
                      <span>Fallback on:</span>
                      {r.fallback_on_5xx && <Badge status="neutral">5xx</Badge>}
                      {r.fallback_on_429 && <Badge status="neutral">429</Badge>}
                      {r.fallback_on_timeout && <Badge status="neutral">timeout {r.timeout_ms}ms</Badge>}
                      {!r.fallback_on_5xx && !r.fallback_on_429 && !r.fallback_on_timeout && (
                        <span className="italic">never (always uses step 1)</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(`route:${r.name}`);
                        toast.success("Copied");
                      }}
                      title="Copy model id"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => startEdit(r)} title="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => setConfirmDelete(r)}
                      title="Delete route"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Edit / Create sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{form.id ? "Edit route" : "New route"}</SheetTitle>
            <SheetDescription>
              The proxy tries each step in order. Falls back on the triggers below.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-5 space-y-5">
            <div className="grid gap-3">
              <div>
                <Label className="text-meta">Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="production-chat"
                  className="mt-1 font-mono"
                />
                <div className="text-meta text-muted-foreground mt-1">
                  Clients will call <code className="font-mono">route:{form.name || "<name>"}</code>
                </div>
              </div>
              <div>
                <Label className="text-meta">Description (optional)</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-meta">Fallback chain</Label>
                <Button
                  size="sm" variant="ghost"
                  onClick={() => setForm({
                    ...form,
                    steps: [...form.steps, { endpoint_id: "", model: "" }],
                  })}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add step
                </Button>
              </div>
              <div className="space-y-2">
                {form.steps.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 border border-border rounded-md p-2.5 bg-surface-2/40">
                    <div className="flex flex-col items-center gap-0.5 pt-1.5 text-muted-foreground">
                      <span className="text-meta font-mono">{i + 1}</span>
                      <button
                        className="hover:text-foreground disabled:opacity-30"
                        disabled={i === 0}
                        onClick={() => moveStep(i, -1)}
                        title="Move up"
                      ><ArrowUp className="h-3 w-3" /></button>
                      <button
                        className="hover:text-foreground disabled:opacity-30"
                        disabled={i === form.steps.length - 1}
                        onClick={() => moveStep(i, 1)}
                        title="Move down"
                      ><ArrowDown className="h-3 w-3" /></button>
                    </div>
                    <div className="flex-1 grid gap-2">
                      <Select
                        value={s.endpoint_id}
                        onValueChange={(v) => {
                          const next = [...form.steps];
                          next[i] = { ...next[i], endpoint_id: v };
                          // Prefill model with endpoint default if user hasn't typed one
                          if (!next[i].model) {
                            const ep = epById.get(v);
                            if (ep?.default_model) next[i].model = ep.default_model;
                          }
                          setForm({ ...form, steps: next });
                        }}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Pick an endpoint" />
                        </SelectTrigger>
                        <SelectContent>
                          {endpoints.length === 0 && (
                            <div className="px-2 py-1.5 text-meta text-muted-foreground">
                              No endpoints — create one first
                            </div>
                          )}
                          {endpoints.map((e: any) => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.name}{e.kind ? ` · ${e.kind}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={s.model}
                        onChange={(e) => {
                          const next = [...form.steps];
                          next[i] = { ...next[i], model: e.target.value };
                          setForm({ ...form, steps: next });
                        }}
                        placeholder="model id (e.g. gpt-4o-mini)"
                        className="h-9 font-mono"
                      />
                    </div>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => setForm({
                        ...form,
                        steps: form.steps.filter((_, idx) => idx !== i),
                      })}
                      disabled={form.steps.length === 1}
                      title="Remove step"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-meta">Fallback triggers</Label>
              <div className="mt-2 space-y-2.5 border border-border rounded-md p-3 bg-surface-2/40">
                <label className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-body">Upstream errors / 5xx</div>
                    <div className="text-meta text-muted-foreground">Try next step on 5xx and network failures</div>
                  </div>
                  <Switch
                    checked={form.fallback_on_5xx}
                    onCheckedChange={(v) => setForm({ ...form, fallback_on_5xx: v })}
                  />
                </label>
                <label className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-body">Rate limits (429)</div>
                    <div className="text-meta text-muted-foreground">Try next step when the upstream returns 429</div>
                  </div>
                  <Switch
                    checked={form.fallback_on_429}
                    onCheckedChange={(v) => setForm({ ...form, fallback_on_429: v })}
                  />
                </label>
                <label className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-body">Slow responses</div>
                    <div className="text-meta text-muted-foreground">Try next step if the upstream doesn't respond in time</div>
                  </div>
                  <Switch
                    checked={form.fallback_on_timeout}
                    onCheckedChange={(v) => setForm({ ...form, fallback_on_timeout: v })}
                  />
                </label>
                <div className="pt-1">
                  <Label className="text-meta">Per-step timeout (ms)</Label>
                  <Input
                    type="number" min={1000} max={120000} step={500}
                    value={form.timeout_ms}
                    onChange={(e) => setForm({ ...form, timeout_ms: Number(e.target.value) || 30000 })}
                    className="mt-1 h-8 w-32 font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                onClick={() => {
                  const err = validateForm();
                  if (err) { toast.error(err); return; }
                  save.mutate();
                }}
                disabled={save.isPending}
              >
                {save.isPending ? "Saving…" : (form.id ? "Save changes" : "Create route")}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete route "{confirmDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Clients calling <code className="font-mono">route:{confirmDelete?.name}</code> will start failing immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDelete && del.mutate(confirmDelete.id)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Routes;
