import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, Save } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useDashboardApi } from "@/lib/api";

/**
 * Token usage spike alerts — workspace-level thresholds and an optional
 * outbound webhook for notifications. The dashboard polls the detector and
 * surfaces an inline banner when the current window exceeds baseline.
 */

type Draft = {
  token_spike_alert_enabled: boolean;
  token_spike_window_hours: number;
  token_spike_min_tokens: number;
  token_spike_ratio: number;
  token_spike_webhook_url: string;
};

const EMPTY: Draft = {
  token_spike_alert_enabled: true,
  token_spike_window_hours: 1,
  token_spike_min_tokens: 10000,
  token_spike_ratio: 3,
  token_spike_webhook_url: "",
};

export function TokenAlertsSection() {
  const { call } = useDashboardApi();
  const qc = useQueryClient();

  const settingsQ = useQuery<{ settings: any }>({
    queryKey: ["policy_settings"],
    queryFn: () => call("get_policy_settings"),
  });

  const snapshot: Draft = useMemo(() => {
    const s = settingsQ.data?.settings;
    if (!s) return EMPTY;
    return {
      token_spike_alert_enabled: s.token_spike_alert_enabled !== false,
      token_spike_window_hours: clampInt(s.token_spike_window_hours ?? 1, 1, 24),
      token_spike_min_tokens: clampInt(s.token_spike_min_tokens ?? 10000, 0, 100_000_000),
      token_spike_ratio: clampNum(s.token_spike_ratio ?? 3, 1.1, 50),
      token_spike_webhook_url: typeof s.token_spike_webhook_url === "string" ? s.token_spike_webhook_url : "",
    };
  }, [settingsQ.data]);

  const [draft, setDraft] = useState<Draft>(EMPTY);
  useEffect(() => { setDraft(snapshot); }, [snapshot]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(snapshot);

  const save = useMutation({
    mutationFn: () => call("save_policy_settings", {
      body: {
        token_spike_alert_enabled: draft.token_spike_alert_enabled,
        token_spike_window_hours: draft.token_spike_window_hours,
        token_spike_min_tokens: draft.token_spike_min_tokens,
        token_spike_ratio: draft.token_spike_ratio,
        token_spike_webhook_url: draft.token_spike_webhook_url.trim() || null,
      },
    }),
    onSuccess: () => {
      toast.success("Token alert settings saved");
      qc.invalidateQueries({ queryKey: ["policy_settings"] });
      qc.invalidateQueries({ queryKey: ["token_spike_alert"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  return (
    <Card className="surface-1 border-border">
      <CardContent className="p-5 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-primary/10 text-primary p-2">
              <Bell className="h-4 w-4" />
            </div>
            <div>
              <div className="text-h2 font-medium">Token usage spike alerts</div>
              <p className="text-meta text-muted-foreground mt-1 max-w-prose">
                Get notified when input or output tokens in the recent window
                exceed your normal baseline. Helps catch runaway prompts, looping
                agents, or leaked keys early.
              </p>
            </div>
          </div>
          <Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            <Save className="h-3.5 w-3.5 mr-1.5" /> Save
          </Button>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div className="flex items-center justify-between gap-3 sm:col-span-3 rounded-md border border-border bg-surface-2 px-3 py-2.5">
            <div>
              <Label className="text-body">Enable alerts</Label>
              <p className="text-meta text-muted-foreground">
                Show an inline banner on the dashboard when a spike is detected.
              </p>
            </div>
            <Switch
              checked={draft.token_spike_alert_enabled}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, token_spike_alert_enabled: v }))}
            />
          </div>

          <div>
            <Label className="text-meta text-muted-foreground">Detection window (hours)</Label>
            <Input
              type="number" min={1} max={24} className="mt-1.5"
              value={draft.token_spike_window_hours}
              onChange={(e) => setDraft((d) => ({ ...d, token_spike_window_hours: clampInt(Number(e.target.value), 1, 24) }))}
            />
            <p className="text-[11px] text-muted-foreground mt-1">Compared to same-length windows over the prior 7 days.</p>
          </div>

          <div>
            <Label className="text-meta text-muted-foreground">Minimum tokens</Label>
            <Input
              type="number" min={0} className="mt-1.5"
              value={draft.token_spike_min_tokens}
              onChange={(e) => setDraft((d) => ({ ...d, token_spike_min_tokens: clampInt(Number(e.target.value), 0, 100_000_000) }))}
            />
            <p className="text-[11px] text-muted-foreground mt-1">Suppresses alerts below this floor.</p>
          </div>

          <div>
            <Label className="text-meta text-muted-foreground">Spike ratio (×)</Label>
            <Input
              type="number" min={1.1} max={50} step={0.1} className="mt-1.5"
              value={draft.token_spike_ratio}
              onChange={(e) => setDraft((d) => ({ ...d, token_spike_ratio: clampNum(Number(e.target.value), 1.1, 50) }))}
            />
            <p className="text-[11px] text-muted-foreground mt-1">Alert when usage ≥ baseline × this multiplier.</p>
          </div>

          <div className="sm:col-span-3">
            <Label className="text-meta text-muted-foreground">Notification webhook (optional)</Label>
            <Input
              type="url" placeholder="https://hooks.example.com/token-spike" className="mt-1.5"
              value={draft.token_spike_webhook_url}
              onChange={(e) => setDraft((d) => ({ ...d, token_spike_webhook_url: e.target.value }))}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Receives a POST with spike details when an alert fires. HTTPS only.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function clampInt(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}
function clampNum(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
