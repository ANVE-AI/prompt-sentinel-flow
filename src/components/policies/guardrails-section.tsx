import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck, Save, Undo2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { KeywordChipInput } from "@/components/keyword-chip-input";
import { useDashboardApi } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Policies → Guardrails
 *
 * Combined admin control for the two top-level guardrail levers:
 *  - Workspace toggle that allows API callers to inject a per-request
 *    `system_prompt` (gated by per-key admin flag in the proxy), plus
 *    its tunable max length.
 *  - Workspace blocked / allowed keyword lists used by the deterministic
 *    keyword layer.
 *
 * Both edit a single in-memory draft. The "Save" / "Rollback" buttons
 * activate only when the draft diverges from the last server snapshot,
 * so admins can experiment freely and revert without page reload.
 */

type Draft = {
  allow_client_system_prompt: boolean;
  system_prompt_max_length: number;
  blocked_keywords: string[];
  allowed_keywords: string[];
  use_global_defaults: boolean;
};

const EMPTY: Draft = {
  allow_client_system_prompt: false,
  system_prompt_max_length: 16000,
  blocked_keywords: [],
  allowed_keywords: [],
  use_global_defaults: true,
};

function clampMax(n: number): number {
  if (!Number.isFinite(n)) return 16000;
  return Math.max(100, Math.min(64000, Math.floor(n)));
}

function eq(a: Draft, b: Draft): boolean {
  return (
    a.allow_client_system_prompt === b.allow_client_system_prompt &&
    a.system_prompt_max_length === b.system_prompt_max_length &&
    a.use_global_defaults === b.use_global_defaults &&
    a.blocked_keywords.length === b.blocked_keywords.length &&
    a.allowed_keywords.length === b.allowed_keywords.length &&
    a.blocked_keywords.every((w, i) => w === b.blocked_keywords[i]) &&
    a.allowed_keywords.every((w, i) => w === b.allowed_keywords[i])
  );
}

export function GuardrailsSection() {
  const { call } = useDashboardApi();
  const qc = useQueryClient();

  const settingsQ = useQuery<{ settings: any }>({
    queryKey: ["policy_settings"],
    queryFn: () => call("get_policy_settings"),
  });
  const policiesQ = useQuery<{ policies: any; global_defaults: string[] }>({
    queryKey: ["policies"],
    queryFn: () => call("get_policies"),
  });

  const snapshot: Draft = useMemo(() => {
    const s = settingsQ.data?.settings;
    const p = policiesQ.data?.policies;
    if (!s && !p) return EMPTY;
    return {
      allow_client_system_prompt: !!s?.allow_client_system_prompt,
      system_prompt_max_length: clampMax(Number(s?.system_prompt_max_length) || 16000),
      blocked_keywords: Array.isArray(p?.blocked_keywords) ? p.blocked_keywords : [],
      allowed_keywords: Array.isArray(p?.allowed_keywords) ? p.allowed_keywords : [],
      use_global_defaults: p?.use_global_defaults !== false,
    };
  }, [settingsQ.data, policiesQ.data]);

  const [draft, setDraft] = useState<Draft>(EMPTY);
  useEffect(() => { setDraft(snapshot); }, [snapshot]);

  const dirty = !eq(draft, snapshot);
  const isLoading = settingsQ.isLoading || policiesQ.isLoading;

  const save = useMutation({
    mutationFn: async () => {
      // Run both writes; surface the first failure so we can rollback UI.
      await Promise.all([
        call("save_policy_settings", {
          body: {
            allow_client_system_prompt: draft.allow_client_system_prompt,
            system_prompt_max_length: draft.system_prompt_max_length,
          },
        }),
        call("save_policies", {
          body: {
            blocked_keywords: draft.blocked_keywords,
            allowed_keywords: draft.allowed_keywords,
            use_global_defaults: draft.use_global_defaults,
          },
        }),
      ]);
    },
    onSuccess: () => {
      toast.success("Guardrails saved", {
        description: `${draft.blocked_keywords.length} blocked · ${draft.allowed_keywords.length} allowed · per-request prompt ${draft.allow_client_system_prompt ? "enabled" : "disabled"}.`,
      });
      qc.invalidateQueries({ queryKey: ["policy_settings"] });
      qc.invalidateQueries({ queryKey: ["policies"] });
    },
    onError: (e: any) => {
      toast.error(e?.message ?? "Failed to save guardrails", {
        description: "Reverting to the last saved state.",
        action: { label: "Keep edits", onClick: () => { /* no-op: leave draft */ } },
      });
      // Defensive rollback: snap UI back to server truth so the admin sees
      // exactly what's live before deciding to retry.
      setDraft(snapshot);
    },
  });

  const rollback = () => {
    setDraft(snapshot);
    toast("Reverted unsaved changes", {
      description: "All fields restored to the last saved state.",
    });
  };

  if (isLoading) {
    return <Skeleton className="h-[420px] rounded-lg" />;
  }

  return (
    <Card className="surface-1 border-border">
      <div className="px-5 pt-4 pb-3 border-b border-border flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Section</div>
          <div className="text-h2 font-medium mt-0.5 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Guardrails
          </div>
          <p className="text-meta text-muted-foreground mt-1 max-w-prose">
            Workspace-wide guardrails: who may inject a per-request system prompt, and which
            keywords the proxy must block or always allow.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <Badge variant="outline" className="text-amber-500 border-amber-500/40">Unsaved changes</Badge>}
          <Button
            size="sm"
            variant="outline"
            onClick={rollback}
            disabled={!dirty || save.isPending}
          >
            <Undo2 className="h-3.5 w-3.5 mr-1" />
            Rollback
          </Button>
          <Button
            size="sm"
            onClick={() => save.mutate()}
            disabled={!dirty || save.isPending}
          >
            <Save className="h-3.5 w-3.5 mr-1" />
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <CardContent className="p-5 space-y-6">
        {/* Per-request system_prompt toggle ---------------------------------- */}
        <div className="rounded-md border border-border surface-2 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Label className="text-body">
                Allow per-request <code className="font-mono text-xs">system_prompt</code>
              </Label>
              <p className="text-meta text-muted-foreground mt-0.5 max-w-prose">
                When on, API keys with the <strong>admin</strong> flag may include a top-level
                <code className="font-mono"> system_prompt</code> string that is injected after the
                workspace guardrail prompt. Off → every request carrying the field gets a 403.
              </p>
            </div>
            <Switch
              checked={draft.allow_client_system_prompt}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, allow_client_system_prompt: v }))}
            />
          </div>
          <div className={cn(
            "mt-3 flex items-center justify-between gap-4",
            !draft.allow_client_system_prompt && "opacity-50 pointer-events-none",
          )}>
            <div className="min-w-0">
              <Label htmlFor="g-sysmax" className="text-body">
                Max <code className="font-mono text-xs">system_prompt</code> length
              </Label>
              <p className="text-meta text-muted-foreground mt-0.5">
                Range 100–64,000 chars. Default 16,000 (~4k tokens). Over-length requests return
                <code className="font-mono"> 400 invalid_request_error</code>.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                id="g-sysmax"
                type="number"
                min={100}
                max={64000}
                step={100}
                value={draft.system_prompt_max_length}
                onChange={(e) => setDraft((d) => ({ ...d, system_prompt_max_length: clampMax(Number(e.target.value)) }))}
                className="w-28 text-right tabular-nums surface-1 border-border"
              />
              <span className="text-meta text-muted-foreground">chars</span>
            </div>
          </div>
        </div>

        {/* Keyword lists ----------------------------------------------------- */}
        <div className="rounded-md border border-border surface-2 p-4 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label className="text-body">Use AnveGuard global defaults</Label>
              <p className="text-meta text-muted-foreground mt-0.5 max-w-prose">
                Layer the curated default block list under your workspace overrides. Allowed
                keywords below take precedence over both lists.
              </p>
            </div>
            <Switch
              checked={draft.use_global_defaults}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, use_global_defaults: v }))}
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            <div>
              <Label htmlFor="g-blocked">Blocked keywords</Label>
              <KeywordChipInput
                id="g-blocked"
                value={draft.blocked_keywords}
                onChange={(blocked_keywords) => setDraft((d) => ({ ...d, blocked_keywords }))}
                placeholder="Add a blocked keyword"
              />
              <div className="text-meta text-muted-foreground mt-2 tabular-nums">
                {draft.blocked_keywords.length} entries
              </div>
            </div>
            <div>
              <Label htmlFor="g-allowed">Allowed keywords (allowlist)</Label>
              <KeywordChipInput
                id="g-allowed"
                value={draft.allowed_keywords}
                onChange={(allowed_keywords) => setDraft((d) => ({ ...d, allowed_keywords }))}
                placeholder="Add an allowlist exception"
              />
              <div className="text-meta text-muted-foreground mt-2 tabular-nums">
                {draft.allowed_keywords.length} entries
              </div>
            </div>
          </div>

          {draft.use_global_defaults && (policiesQ.data?.global_defaults?.length ?? 0) > 0 && (
            <details className="rounded-md border border-border surface-1 p-3">
              <summary className="text-meta text-muted-foreground cursor-pointer">
                Preview global defaults ({policiesQ.data?.global_defaults?.length ?? 0})
              </summary>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(policiesQ.data?.global_defaults ?? []).map((term) => (
                  <Badge key={term} variant="outline" className="font-mono">{term}</Badge>
                ))}
              </div>
            </details>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
