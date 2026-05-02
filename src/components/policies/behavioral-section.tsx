import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity } from "lucide-react";
import { useDashboardApi } from "@/lib/api";
import { toast } from "sonner";

type Action = "block" | "flag";

const SIGNALS = [
  { name: "Instruction churn", desc: "≥3 of the last 4 user turns countermand the previous turn." },
  { name: "Role-play escalation", desc: "Repeated jailbreak personas (DAN, AIM, \"grandma\", …) across turns." },
  { name: "Encoding escalation", desc: "Encoded-payload ratio strictly increasing across the last 3 turns." },
  { name: "Length spike", desc: "Latest turn is >1500 chars and 8× the conversation average." },
];

export function BehavioralSection() {
  const { call } = useDashboardApi();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ settings: any }>({
    queryKey: ["policy_settings"],
    queryFn: () => call("get_policy_settings"),
  });

  const [enabled, setEnabled] = useState(true);
  const [action, setAction] = useState<Action>("flag");
  const [windowMin, setWindowMin] = useState(5);
  const [threshold, setThreshold] = useState(10);

  useEffect(() => {
    const s = data?.settings;
    if (!s) return;
    setEnabled(s.enable_behavioral !== false);
    if (s.behavioral_action === "block" || s.behavioral_action === "flag") {
      setAction(s.behavioral_action);
    }
    if (typeof s.throttle_window_minutes === "number") setWindowMin(s.throttle_window_minutes);
    if (typeof s.throttle_flag_threshold === "number") setThreshold(s.throttle_flag_threshold);
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      call("save_policy_settings", {
        body: {
          enable_behavioral: enabled,
          behavioral_action: action,
          throttle_window_minutes: windowMin,
          throttle_flag_threshold: threshold,
        },
      }),
    onSuccess: () => {
      toast.success("Behavioral settings saved");
      qc.invalidateQueries({ queryKey: ["policy_settings"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  return (
    <Card>
      <CardContent className="space-y-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-foreground-muted" />
              <h2 className="text-h4">Behavioral heuristics &amp; throttling</h2>
              <Badge variant="outline">multi-turn</Badge>
            </div>
            <p className="text-body-sm text-foreground-muted mt-1 max-w-2xl">
              Looks across the whole conversation for risky patterns single-turn
              checks miss, and refuses additional requests from API keys that
              produce too many flagged conversations in a short window.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Enable behavioral heuristics" />
        </div>

        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className={`space-y-6 ${enabled ? "" : "opacity-50 pointer-events-none"}`}>
            <div>
              <Label className="text-body-sm font-medium">Detected signals</Label>
              <ul className="mt-2 space-y-1.5">
                {SIGNALS.map((s) => (
                  <li key={s.name} className="text-body-sm">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-foreground-muted"> — {s.desc}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <Label className="text-body-sm font-medium">Action when a signal fires</Label>
              <div className="grid gap-3 sm:grid-cols-2 mt-2">
                {(["flag", "block"] as Action[]).map((opt) => {
                  const active = action === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setAction(opt)}
                      className={`text-left rounded-lg border p-4 transition-colors ${
                        active
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:border-foreground-muted"
                      }`}
                      aria-pressed={active}
                    >
                      <div className="font-medium capitalize">{opt}</div>
                      <p className="text-body-sm text-foreground-muted mt-1">
                        {opt === "flag"
                          ? "Forward the request, but record the signal in logs (recommended for monitoring)."
                          : "Reject the request with the configured block message."}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border border-border p-4 space-y-3">
              <div>
                <Label className="text-body-sm font-medium">Risk-window throttle</Label>
                <p className="text-body-sm text-foreground-muted mt-1">
                  Refuse new requests (HTTP 429) from an API key that has accumulated
                  this many flagged or blocked verdicts within the rolling window.
                  Set the threshold to <strong>0</strong> to disable throttling.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="throttle_window" className="text-body-sm">Window (minutes)</Label>
                  <Input
                    id="throttle_window"
                    type="number"
                    min={1}
                    max={1440}
                    value={windowMin}
                    onChange={(e) => setWindowMin(Number(e.target.value) || 1)}
                  />
                </div>
                <div>
                  <Label htmlFor="throttle_threshold" className="text-body-sm">Flag threshold</Label>
                  <Input
                    id="throttle_threshold"
                    type="number"
                    min={0}
                    max={100000}
                    value={threshold}
                    onChange={(e) => setThreshold(Math.max(0, Number(e.target.value) || 0))}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
