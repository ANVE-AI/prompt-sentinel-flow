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
  { name: "Instruction churn", desc: "Recent user turns countermand the previous turn." },
  { name: "Role-play escalation", desc: "Repeated jailbreak personas (DAN, AIM, \"grandma\", …) across turns." },
  { name: "Encoding escalation", desc: "Encoded-payload ratio strictly increasing across the last 3 turns." },
  { name: "Length spike", desc: "Latest turn is >1500 chars and a configurable multiple of the conversation average." },
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
  const [churn, setChurn] = useState(3);
  const [persona, setPersona] = useState(3);
  const [encodingStep, setEncodingStep] = useState(0.25);
  const [lengthMult, setLengthMult] = useState(8);

  useEffect(() => {
    const s = data?.settings;
    if (!s) return;
    setEnabled(s.enable_behavioral !== false);
    if (s.behavioral_action === "block" || s.behavioral_action === "flag") {
      setAction(s.behavioral_action);
    }
    if (typeof s.throttle_window_minutes === "number") setWindowMin(s.throttle_window_minutes);
    if (typeof s.throttle_flag_threshold === "number") setThreshold(s.throttle_flag_threshold);
    if (typeof s.behavioral_churn_threshold === "number") setChurn(s.behavioral_churn_threshold);
    if (typeof s.behavioral_persona_threshold === "number") setPersona(s.behavioral_persona_threshold);
    if (typeof s.behavioral_encoding_ratio_step === "number") setEncodingStep(s.behavioral_encoding_ratio_step);
    if (typeof s.behavioral_length_multiplier === "number") setLengthMult(s.behavioral_length_multiplier);
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      call("save_policy_settings", {
        body: {
          enable_behavioral: enabled,
          behavioral_action: action,
          throttle_window_minutes: windowMin,
          throttle_flag_threshold: threshold,
          behavioral_churn_threshold: churn,
          behavioral_persona_threshold: persona,
          behavioral_encoding_ratio_step: encodingStep,
          behavioral_length_multiplier: lengthMult,
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
                <Label className="text-body-sm font-medium">Heuristic thresholds</Label>
                <p className="text-body-sm text-foreground-muted mt-1">
                  Tune how aggressive each detector is. Lower values fire sooner; higher values reduce false positives.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="b_churn" className="text-body-sm">Instruction-churn count</Label>
                  <Input
                    id="b_churn"
                    type="number"
                    min={1}
                    max={20}
                    value={churn}
                    onChange={(e) => setChurn(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                  />
                  <p className="text-body-xs text-foreground-muted mt-1">Min flip-phrase turns out of the last 4.</p>
                </div>
                <div>
                  <Label htmlFor="b_persona" className="text-body-sm">Persona match limit</Label>
                  <Input
                    id="b_persona"
                    type="number"
                    min={1}
                    max={20}
                    value={persona}
                    onChange={(e) => setPersona(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                  />
                  <p className="text-body-xs text-foreground-muted mt-1">Min jailbreak-persona mentions across user turns.</p>
                </div>
                <div>
                  <Label htmlFor="b_encoding" className="text-body-sm">Encoding ratio step</Label>
                  <Input
                    id="b_encoding"
                    type="number"
                    step="0.01"
                    min={0}
                    max={1}
                    value={encodingStep}
                    onChange={(e) => setEncodingStep(Math.min(1, Math.max(0, Number(e.target.value) || 0)))}
                  />
                  <p className="text-body-xs text-foreground-muted mt-1">Final encoded ratio (0–1) the last turn must exceed.</p>
                </div>
                <div>
                  <Label htmlFor="b_length" className="text-body-sm">Length-spike multiplier</Label>
                  <Input
                    id="b_length"
                    type="number"
                    step="0.5"
                    min={1}
                    max={100}
                    value={lengthMult}
                    onChange={(e) => setLengthMult(Math.max(1, Number(e.target.value) || 1))}
                  />
                  <p className="text-body-xs text-foreground-muted mt-1">Latest turn must exceed this multiple of the average.</p>
                </div>
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
