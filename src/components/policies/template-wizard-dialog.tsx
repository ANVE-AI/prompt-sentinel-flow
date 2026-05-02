import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Save, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDashboardApi } from "@/lib/api";
import { cn } from "@/lib/utils";

type Rule = {
  id?: string;
  name: string;
  kind: "regex" | "detector";
  severity: "low" | "med" | "high";
  direction: "input" | "output" | "both";
  enabled: boolean;
  config: Record<string, unknown>;
  applies_to_intents?: string[];
};

const SETTING_KEYS: { key: string; label: string }[] = [
  { key: "enable_normalizer", label: "Text normalizer" },
  { key: "enable_patterns", label: "Pattern layer" },
  { key: "enable_heuristics", label: "Built-in heuristics" },
  { key: "enable_injection_guard", label: "Injection guard" },
  { key: "injection_action", label: "Injection action" },
  { key: "enable_behavioral", label: "Behavioral layer" },
  { key: "behavioral_action", label: "Behavioral action" },
  { key: "throttle_window_minutes", label: "Throttle window" },
  { key: "throttle_flag_threshold", label: "Throttle threshold" },
  { key: "enable_fuzzy_keywords", label: "Fuzzy keyword matching" },
  { key: "enable_semantic_keywords", label: "Semantic keyword matching" },
  { key: "semantic_threshold", label: "Semantic threshold" },
  { key: "strict_mode", label: "Strict mode" },
  { key: "enable_intent", label: "Intent classifier" },
  { key: "intent_shadow_mode", label: "Intent shadow mode" },
];

type Step = 1 | 2 | 3 | 4 | 5;

const FALLBACK_INTENTS = [
  "jailbreak", "prompt_injection", "data_exfiltration",
  "off_topic", "tool_abuse", "harassment", "other",
];

export function TemplateWizardDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { call } = useDashboardApi();
  const qc = useQueryClient();

  const policiesQ = useQuery<{ policies: any }>({
    queryKey: ["policies"],
    queryFn: () => call("get_policies"),
    enabled: open,
  });
  const settingsQ = useQuery<{ settings: any }>({
    queryKey: ["policy_settings"],
    queryFn: () => call("get_policy_settings"),
    enabled: open,
  });
  const rulesQ = useQuery<{ rules: Rule[] }>({
    queryKey: ["policy_rules"],
    queryFn: () => call("list_policy_rules"),
    enabled: open,
  });

  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [includeKeywords, setIncludeKeywords] = useState(true);
  const [pickedSettings, setPickedSettings] = useState<Record<string, boolean>>(
    () => Object.fromEntries(SETTING_KEYS.map((s) => [s.key, true])),
  );
  const [pickedRuleIds, setPickedRuleIds] = useState<Record<string, boolean>>({});

  // Reset wizard state every time it opens.
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setName("");
    setDescription("");
    setIncludeKeywords(true);
    setPickedSettings(Object.fromEntries(SETTING_KEYS.map((s) => [s.key, true])));
    setPickedRuleIds({});
  }, [open]);

  // Default-select all live rules once they load.
  useEffect(() => {
    if (!rulesQ.data?.rules) return;
    setPickedRuleIds((prev) => {
      if (Object.keys(prev).length) return prev;
      return Object.fromEntries(rulesQ.data!.rules.filter((r) => r.id).map((r) => [r.id!, true]));
    });
  }, [rulesQ.data]);

  const allRules = rulesQ.data?.rules ?? [];
  const liveSettings = settingsQ.data?.settings ?? {};
  const livePolicy = policiesQ.data?.policies ?? {};

  const selectedRules = useMemo(
    () => allRules.filter((r) => r.id && pickedRuleIds[r.id]),
    [allRules, pickedRuleIds],
  );
  const selectedSettings = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const { key } of SETTING_KEYS) {
      if (pickedSettings[key] && liveSettings[key] !== undefined) out[key] = liveSettings[key];
    }
    return out;
  }, [pickedSettings, liveSettings]);

  const policySnapshot = useMemo(() => {
    if (!includeKeywords) return {};
    return {
      blocked_keywords: livePolicy.blocked_keywords ?? [],
      allowed_keywords: livePolicy.allowed_keywords ?? [],
      use_global_defaults: livePolicy.use_global_defaults !== false,
      block_message: livePolicy.block_message ?? "This request was blocked by your organization's AI policy.",
    };
  }, [includeKeywords, livePolicy]);

  const save = useMutation({
    mutationFn: () =>
      call("save_policy_template", {
        body: {
          name: name.trim(),
          description: description.trim() || null,
          policy: policySnapshot,
          settings: selectedSettings,
          rules: selectedRules.map(({ id: _id, ...rest }) => rest),
        },
      }),
    onSuccess: () => {
      toast.success(`Template "${name.trim()}" saved`);
      qc.invalidateQueries({ queryKey: ["policy_templates"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save template"),
  });

  const isLoading = policiesQ.isLoading || settingsQ.isLoading || rulesQ.isLoading;
  const canNext =
    (step === 1 && name.trim().length > 0) ||
    (step === 2) ||
    (step === 3) ||
    (step === 4);

  const stepTitles: Record<Step, string> = {
    1: "Name your template",
    2: "Choose rules",
    3: "Choose settings",
    4: "Review & save",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            New policy template · <span className="text-muted-foreground font-normal">{stepTitles[step]}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1.5 px-1">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                n <= step ? "bg-primary" : "bg-border",
              )}
            />
          ))}
        </div>

        <div className="min-h-[320px]">
          {isLoading ? (
            <div className="space-y-2 py-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : step === 1 ? (
            <div className="space-y-4 py-2">
              <div>
                <Label htmlFor="tpl-name">Name</Label>
                <Input
                  id="tpl-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Support agent — strict"
                  className="mt-1.5"
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="tpl-desc">Description (optional)</Label>
                <Textarea
                  id="tpl-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What this template is for, who should apply it…"
                  className="mt-1.5 min-h-[100px]"
                />
              </div>
              <label className="flex items-start gap-2 cursor-pointer rounded-md border border-border surface-2 p-3">
                <Checkbox
                  checked={includeKeywords}
                  onCheckedChange={(v) => setIncludeKeywords(!!v)}
                  className="mt-0.5"
                />
                <span className="space-y-0.5">
                  <span className="text-body block">Include keyword guardrails</span>
                  <span className="text-meta text-muted-foreground">
                    {(livePolicy.blocked_keywords?.length ?? 0)} blocked ·{" "}
                    {(livePolicy.allowed_keywords?.length ?? 0)} allowed · global defaults{" "}
                    {livePolicy.use_global_defaults !== false ? "on" : "off"}
                  </span>
                </span>
              </label>
            </div>
          ) : step === 2 ? (
            <RulePicker
              rules={allRules}
              picked={pickedRuleIds}
              onChange={setPickedRuleIds}
            />
          ) : step === 3 ? (
            <SettingsPicker
              picked={pickedSettings}
              onChange={setPickedSettings}
              liveSettings={liveSettings}
            />
          ) : (
            <ReviewStep
              name={name}
              description={description}
              includeKeywords={includeKeywords}
              policy={policySnapshot}
              settings={selectedSettings}
              rules={selectedRules}
            />
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {step > 1 ? (
            <Button variant="outline" onClick={() => setStep((s) => (s - 1) as Step)}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
          {step < 4 ? (
            <Button
              disabled={!canNext}
              onClick={() => setStep((s) => (s + 1) as Step)}
            >
              Next <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          ) : (
            <Button disabled={save.isPending || !name.trim()} onClick={() => save.mutate()}>
              <Save className="h-3.5 w-3.5 mr-1" />
              {save.isPending ? "Saving…" : "Save template"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RulePicker({
  rules,
  picked,
  onChange,
}: {
  rules: Rule[];
  picked: Record<string, boolean>;
  onChange: (next: Record<string, boolean>) => void;
}) {
  const allOn = rules.length > 0 && rules.every((r) => r.id && picked[r.id]);
  const toggleAll = () => {
    if (allOn) onChange({});
    else onChange(Object.fromEntries(rules.filter((r) => r.id).map((r) => [r.id!, true])));
  };
  return (
    <div className="space-y-3 py-2">
      <div className="flex items-center justify-between">
        <p className="text-meta text-muted-foreground">
          Pick which rules from your live policy should ship with this template.
        </p>
        {rules.length > 0 && (
          <Button size="sm" variant="ghost" onClick={toggleAll}>
            {allOn ? "Clear all" : "Select all"}
          </Button>
        )}
      </div>
      {rules.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-meta text-muted-foreground">
          No rules configured yet — you can still save a template with just keywords and settings.
        </div>
      ) : (
        <ScrollArea className="h-[260px] rounded-md border border-border surface-2">
          <ul className="divide-y divide-border">
            {rules.map((r) => (
              <li key={r.id} className="flex items-start gap-3 p-3">
                <Checkbox
                  checked={!!(r.id && picked[r.id])}
                  onCheckedChange={(v) => {
                    if (!r.id) return;
                    const next = { ...picked };
                    if (v) next[r.id] = true;
                    else delete next[r.id];
                    onChange(next);
                  }}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-body font-medium truncate">{r.name || "(unnamed rule)"}</span>
                    <Badge variant="outline" className="text-[10px]">{r.kind}</Badge>
                    <Badge variant="outline" className="text-[10px]">{r.severity}</Badge>
                    {!r.enabled && <Badge variant="outline" className="text-[10px]">disabled</Badge>}
                  </div>
                  <div className="text-meta text-muted-foreground font-mono mt-0.5 truncate">
                    {r.kind === "regex"
                      ? String((r.config as any)?.pattern ?? "")
                      : String((r.config as any)?.detector ?? "")}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
    </div>
  );
}

function SettingsPicker({
  picked,
  onChange,
  liveSettings,
}: {
  picked: Record<string, boolean>;
  onChange: (next: Record<string, boolean>) => void;
  liveSettings: Record<string, any>;
}) {
  return (
    <div className="space-y-3 py-2">
      <p className="text-meta text-muted-foreground">
        Pick which behavior settings to capture. Snapshot reflects your current live values.
      </p>
      <ScrollArea className="h-[280px] rounded-md border border-border surface-2">
        <ul className="divide-y divide-border">
          {SETTING_KEYS.map(({ key, label }) => {
            const v = liveSettings[key];
            return (
              <li key={key} className="flex items-center gap-3 p-3">
                <Checkbox
                  checked={!!picked[key]}
                  onCheckedChange={(c) => onChange({ ...picked, [key]: !!c })}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-body">{label}</div>
                  <div className="text-meta text-muted-foreground font-mono truncate">{key}</div>
                </div>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {v === undefined ? "—" : typeof v === "boolean" ? (v ? "on" : "off") : String(v)}
                </Badge>
              </li>
            );
          })}
        </ul>
      </ScrollArea>
    </div>
  );
}

function ReviewStep({
  name,
  description,
  includeKeywords,
  policy,
  settings,
  rules,
}: {
  name: string;
  description: string;
  includeKeywords: boolean;
  policy: Record<string, any>;
  settings: Record<string, unknown>;
  rules: Rule[];
}) {
  const stats = [
    { label: "Rules", value: rules.length },
    { label: "Settings", value: Object.keys(settings).length },
    {
      label: "Keywords",
      value: includeKeywords
        ? (policy.blocked_keywords?.length ?? 0) + (policy.allowed_keywords?.length ?? 0)
        : 0,
    },
  ];
  return (
    <div className="space-y-4 py-2">
      <div className="rounded-md border border-border surface-2 p-3">
        <div className="text-meta uppercase tracking-wider text-muted-foreground">Template</div>
        <div className="text-body font-medium mt-0.5">{name || "(unnamed)"}</div>
        {description && <div className="text-meta text-muted-foreground mt-1">{description}</div>}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-md border border-border surface-2 p-3">
            <div className="text-meta text-muted-foreground">{s.label}</div>
            <div className="text-display tabular-nums mt-0.5">{s.value}</div>
          </div>
        ))}
      </div>
      {rules.length > 0 && (
        <div>
          <div className="text-meta uppercase tracking-wider text-muted-foreground mb-1.5">Included rules</div>
          <div className="flex flex-wrap gap-1.5">
            {rules.slice(0, 12).map((r, i) => (
              <Badge key={i} variant="outline" className="text-[10px]">{r.name || r.kind}</Badge>
            ))}
            {rules.length > 12 && <Badge variant="outline" className="text-[10px]">+{rules.length - 12} more</Badge>}
          </div>
        </div>
      )}
    </div>
  );
}
