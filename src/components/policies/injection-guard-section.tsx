import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldOff, ShieldAlert, ShieldCheck } from "lucide-react";
import { useDashboardApi } from "@/lib/api";
import { toast } from "sonner";

type InjectionAction = "block" | "sanitize" | "flag";

const ACTIONS: { value: InjectionAction; label: string; description: string; icon: typeof ShieldOff }[] = [
  {
    value: "block",
    label: "Block",
    description:
      "Reject the request and return the configured block message. Safest default.",
    icon: ShieldOff,
  },
  {
    value: "sanitize",
    label: "Sanitize",
    description:
      "Replace just the offending phrases with [redacted] and forward the rest. Lets benign parts of mixed prompts through.",
    icon: ShieldAlert,
  },
  {
    value: "flag",
    label: "Flag only",
    description:
      "Forward the request unchanged but record the detection in logs. Use for monitoring before enforcing.",
    icon: ShieldCheck,
  },
];

export function InjectionGuardSection() {
  const { call } = useDashboardApi();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ settings: any }>({
    queryKey: ["policy_settings"],
    queryFn: () => call("get_policy_settings"),
  });

  const [enabled, setEnabled] = useState(true);
  const [action, setAction] = useState<InjectionAction>("block");

  useEffect(() => {
    const s = data?.settings;
    if (!s) return;
    setEnabled(s.enable_injection_guard !== false);
    if (s.injection_action === "block" || s.injection_action === "sanitize" || s.injection_action === "flag") {
      setAction(s.injection_action);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      call("save_policy_settings", {
        body: { enable_injection_guard: enabled, injection_action: action },
      }),
    onSuccess: () => {
      toast.success("Injection guard saved");
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
              <h2 className="text-h4">Prompt injection &amp; jailbreak guard</h2>
              <Badge variant="outline">recommended</Badge>
            </div>
            <p className="text-body-sm text-foreground-muted mt-1 max-w-2xl">
              Detects attempts to override your system or developer instructions —
              "ignore previous instructions", DAN-style personas, fake role tags,
              system-prompt extraction, and similar patterns. Catches obfuscated
              variants (zero-width chars, base64, leetspeak) via the normalizer.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Enable injection guard" />
        </div>

        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className={enabled ? "" : "opacity-50 pointer-events-none"}>
            <Label className="text-body-sm font-medium">When an attempt is detected</Label>
            <div className="grid gap-3 sm:grid-cols-3 mt-2">
              {ACTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = action === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAction(opt.value)}
                    className={`text-left rounded-lg border p-4 transition-colors ${
                      active
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:border-foreground-muted"
                    }`}
                    aria-pressed={active}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      <span className="font-medium">{opt.label}</span>
                    </div>
                    <p className="text-body-sm text-foreground-muted mt-2">
                      {opt.description}
                    </p>
                  </button>
                );
              })}
            </div>
            {action === "sanitize" && (
              <p className="text-body-sm text-foreground-muted mt-3">
                Note: if the attempt is only detectable after normalization (e.g.
                base64-only payload), the guard falls back to <strong>block</strong>{" "}
                because the offending span can't be safely rewritten.
              </p>
            )}
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
