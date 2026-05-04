import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useDashboardApi } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle, Bell, BellRing, Plus, TestTube, Trash2, Webhook, ShieldAlert, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AlertSubscription {
  id: string;
  name: string;
  kind: "block_spike" | "token_spike" | "audit_event";
  target_url: string;
  threshold_value: number | null;
  threshold_window_minutes: number;
  audit_action_filter: string[] | null;
  cooldown_minutes: number;
  enabled: boolean;
  last_fired_at: string | null;
  fire_count: number;
  has_secret?: boolean;
}

const KIND_META: Record<AlertSubscription["kind"], { label: string; description: string; icon: typeof Bell }> = {
  block_spike: {
    label: "Block spike",
    description: "Fire when N requests are blocked over a window — early warning of attack waves or noisy false positives.",
    icon: ShieldAlert,
  },
  token_spike: {
    label: "Token spike",
    description: "Fire when total tokens (in + out) exceed a threshold — catches runaway costs or quota abuse.",
    icon: AlertTriangle,
  },
  audit_event: {
    label: "Audit event",
    description: "Fire on specific governance events (key rotation, policy changes, deletion requests).",
    icon: Bell,
  },
};

export default function Alerts() {
  const { call } = useDashboardApi();
  const qc = useQueryClient();
  const [openDialog, setOpenDialog] = useState(false);
  const [editing, setEditing] = useState<AlertSubscription | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["alert_subscriptions"],
    queryFn: () => call<{ subscriptions: AlertSubscription[] }>("list_alert_subscriptions"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => call("delete_alert_subscription", { body: { id } }),
    onSuccess: () => {
      toast.success("Alert subscription deleted");
      qc.invalidateQueries({ queryKey: ["alert_subscriptions"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Delete failed"),
  });

  const test = useMutation({
    mutationFn: (id: string) => call<{ ok: boolean; status: number; duration_ms: number; error?: string }>("test_alert_subscription", { body: { id } }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(`Test fired — ${res.status} in ${res.duration_ms}ms`);
      } else {
        toast.error(`Test failed: ${res.error ?? `HTTP ${res.status}`}`);
      }
      qc.invalidateQueries({ queryKey: ["alert_subscriptions"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Test fire failed"),
  });

  const subscriptions = data?.subscriptions ?? [];

  return (
    <div className="px-4 md:px-6 py-5 space-y-5 max-w-5xl mx-auto">
      <PageHeader
        title="Alerts"
        description="Webhook subscriptions that fire when block / token thresholds trip or specific audit events happen. Delivery is HMAC-signed when you set a secret."
        actions={
          <Dialog open={openDialog} onOpenChange={(o) => { setOpenDialog(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={() => setEditing(null)}>
                <Plus className="h-4 w-4" />
                New alert
              </Button>
            </DialogTrigger>
            <AlertDialog
              editing={editing}
              onClose={() => { setOpenDialog(false); setEditing(null); }}
              onSaved={() => qc.invalidateQueries({ queryKey: ["alert_subscriptions"] })}
            />
          </Dialog>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : subscriptions.length === 0 ? (
        <Card className="p-8">
          <EmptyState
            icon={<BellRing className="h-5 w-5" />}
            title="No alert subscriptions yet"
            description="Get pinged in Slack, PagerDuty, or any webhook receiver the moment something interesting happens — block spikes during an attack, runaway token usage, or governance changes."
            action={
              <Button size="sm" onClick={() => setOpenDialog(true)}>
                <Plus className="h-4 w-4" /> Create your first alert
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {subscriptions.map((s) => {
            const meta = KIND_META[s.kind];
            const Icon = meta.icon;
            return (
              <Card key={s.id} className="p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className={cn(
                      "grid h-10 w-10 shrink-0 place-items-center rounded-lg",
                      s.enabled
                        ? "bg-primary/15 text-primary"
                        : "bg-muted/40 text-muted-foreground",
                    )}>
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-semibold truncate">{s.name}</h3>
                        <Badge variant="outline" className="text-meta">{meta.label}</Badge>
                        {!s.enabled && <Badge variant="secondary" className="text-meta">Paused</Badge>}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                        <Webhook className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <code className="truncate font-mono text-xs">{s.target_url}</code>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-meta text-muted-foreground">
                        {s.kind !== "audit_event" && s.threshold_value !== null && (
                          <span>≥ {s.threshold_value.toLocaleString()} per {s.threshold_window_minutes}m</span>
                        )}
                        {s.kind === "audit_event" && (
                          <span>
                            {s.audit_action_filter?.length
                              ? `${s.audit_action_filter.length} verb${s.audit_action_filter.length === 1 ? "" : "s"}`
                              : "all verbs"}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          cooldown {s.cooldown_minutes}m
                        </span>
                        <span>fired {s.fire_count.toLocaleString()}×</span>
                        {s.last_fired_at && (
                          <span title={s.last_fired_at}>
                            last {new Date(s.last_fired_at).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm" variant="outline"
                      onClick={() => test.mutate(s.id)}
                      disabled={test.isPending}
                      title="Send a synthetic test payload to your webhook"
                    >
                      <TestTube className="h-3.5 w-3.5" />
                      Test
                    </Button>
                    <Button
                      size="sm" variant="outline"
                      onClick={() => { setEditing(s); setOpenDialog(true); }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm" variant="ghost"
                      onClick={() => {
                        if (confirm(`Delete alert "${s.name}"? This can't be undone.`)) remove.mutate(s.id);
                      }}
                      disabled={remove.isPending}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AlertDialog({
  editing, onClose, onSaved,
}: {
  editing: AlertSubscription | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { call } = useDashboardApi();
  const isEdit = !!editing;
  const [name, setName] = useState(editing?.name ?? "");
  const [kind, setKind] = useState<AlertSubscription["kind"]>(editing?.kind ?? "block_spike");
  const [targetUrl, setTargetUrl] = useState(editing?.target_url ?? "");
  const [thresholdValue, setThresholdValue] = useState<string>(
    editing?.threshold_value !== null && editing?.threshold_value !== undefined
      ? String(editing.threshold_value) : "10",
  );
  const [windowMin, setWindowMin] = useState<string>(String(editing?.threshold_window_minutes ?? 5));
  const [cooldownMin, setCooldownMin] = useState<string>(String(editing?.cooldown_minutes ?? 5));
  const [enabled, setEnabled] = useState(editing?.enabled ?? true);
  const [webhookSecret, setWebhookSecret] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const save = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    if (!targetUrl.trim()) { toast.error("Webhook URL is required"); return; }
    setSubmitting(true);
    try {
      await call("save_alert_subscription", {
        body: {
          ...(isEdit ? { id: editing!.id } : {}),
          name: name.trim(),
          kind,
          target_url: targetUrl.trim(),
          threshold_value: kind === "audit_event" ? null : Number(thresholdValue),
          threshold_window_minutes: Number(windowMin),
          cooldown_minutes: Number(cooldownMin),
          enabled,
          ...(webhookSecret ? { webhook_secret: webhookSecret } : {}),
        },
      });
      toast.success(isEdit ? "Alert updated" : "Alert created");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit alert subscription" : "New alert subscription"}</DialogTitle>
        <DialogDescription>{KIND_META[kind].description}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label htmlFor="alert-name">Name</Label>
          <Input
            id="alert-name" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Slack: prod block alerts"
            maxLength={100}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="alert-kind">Trigger</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as AlertSubscription["kind"])}>
            <SelectTrigger id="alert-kind"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(KIND_META) as AlertSubscription["kind"][]).map((k) => {
                const Icon = KIND_META[k].icon;
                return (
                  <SelectItem key={k} value={k}>
                    <span className="inline-flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5" /> {KIND_META[k].label}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="alert-url">Webhook URL</Label>
          <Input
            id="alert-url" value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="https://hooks.slack.com/services/..."
            type="url"
          />
          <p className="text-meta text-muted-foreground">
            HTTPS required (HTTP only on localhost). Private IPs and Supabase hosts are blocked for safety.
          </p>
        </div>

        {kind !== "audit_event" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="alert-threshold">Threshold</Label>
              <Input
                id="alert-threshold" type="number" min={1}
                value={thresholdValue} onChange={(e) => setThresholdValue(e.target.value)}
              />
              <p className="text-meta text-muted-foreground">
                {kind === "block_spike" ? "Blocked requests" : "Total tokens"}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="alert-window">Window (minutes)</Label>
              <Input
                id="alert-window" type="number" min={1} max={1440}
                value={windowMin} onChange={(e) => setWindowMin(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="alert-cooldown">Cooldown (minutes)</Label>
          <Input
            id="alert-cooldown" type="number" min={0} max={1440}
            value={cooldownMin} onChange={(e) => setCooldownMin(e.target.value)}
          />
          <p className="text-meta text-muted-foreground">
            Minimum minutes between fires for this subscription, so a sustained burst doesn't flood your receiver.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="alert-secret">
            HMAC secret <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Input
            id="alert-secret" type="password" value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            placeholder={isEdit ? "Leave blank to keep current secret" : "Optional shared secret"}
          />
          <p className="text-meta text-muted-foreground">
            Sets <code className="font-mono">X-AnveGuard-Signature: sha256=&lt;hex&gt;</code> on every delivery so your receiver can verify authenticity.
          </p>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border bg-surface-2 px-3 py-2">
          <div>
            <Label htmlFor="alert-enabled" className="text-sm">Enabled</Label>
            <p className="text-meta text-muted-foreground">When off, the firing engine skips this subscription entirely.</p>
          </div>
          <Switch id="alert-enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button onClick={save} disabled={submitting}>
          {submitting ? "Saving…" : isEdit ? "Save changes" : "Create alert"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
