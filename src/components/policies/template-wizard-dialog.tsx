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
  const settingsQ = useQuery<{ settings: any; known_intents?: string[] }>({
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
  const [intentScope, setIntentScope] = useState<string[]>([]);
  const [customIntent, setCustomIntent] = useState("");
  const [unknownFallback, setUnknownFallback] = useState<"apply_no_rules" | "apply_default_rules" | "reject">("apply_no_rules");

  // Reset wizard state every time it opens.
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setName("");
    setDescription("");
    setIncludeKeywords(true);
    setPickedSettings(Object.fromEntries(SETTING_KEYS.map((s) => [s.key, true])));
    setPickedRuleIds({});
    setIntentScope([]);
    setCustomIntent("");
    setUnknownFallback("apply_no_rules");
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
          applies_to_intents: intentScope,
          unknown_intent_fallback: unknownFallback,
        },
      }),
    onSuccess: () => {
      toast.success(`Template "${name.trim()}" saved`);
      qc.invalidateQueries({ queryKey: ["policy_templates"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save template"),
  });

  const knownIntents = useMemo(() => {
    const fromServer = settingsQ.data?.known_intents ?? [];
    const merged = Array.from(new Set([...FALLBACK_INTENTS, ...fromServer, ...intentScope]));
    return merged;
  }, [settingsQ.data, intentScope]);

  const isLoading = policiesQ.isLoading || settingsQ.isLoading || rulesQ.isLoading;
  const canNext =
    (step === 1 && name.trim().length > 0) ||
    (step === 2) ||
    (step === 3) ||
    (step === 4) ||
    (step === 5);

  const stepTitles: Record<Step, string> = {
    1: "Name your template",
    2: "Choose rules",
    3: "Choose settings",
    4: "Intent routing",
    5: "Review & save",
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
          {[1, 2, 3, 4, 5].map((n) => (
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
          ) : step === 4 ? (
            <IntentScopeStep
              knownIntents={knownIntents}
              scope={intentScope}
              onChange={setIntentScope}
              customIntent={customIntent}
              onCustomChange={setCustomIntent}
              unknownFallback={unknownFallback}
              onUnknownFallbackChange={setUnknownFallback}
            />
          ) : (
            <ReviewStep
              name={name}
              description={description}
              includeKeywords={includeKeywords}
              policy={policySnapshot}
              settings={selectedSettings}
              rules={selectedRules}
              intentScope={intentScope}
              unknownFallback={unknownFallback}
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
          {step < 5 ? (
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

type UnknownFallback = "apply_no_rules" | "apply_default_rules" | "reject";

const FALLBACK_OPTIONS: { value: UnknownFallback; label: string; description: string }[] = [
  { value: "apply_no_rules", label: "Apply no rules", description: "Skip this template's rules and let the request through unchanged." },
  { value: "apply_default_rules", label: "Apply default rules", description: "Run the template's rules anyway, treating the request as in-scope." },
  { value: "reject", label: "Reject the request", description: "Block the request with a policy error when intent can't be detected." },
];

function IntentScopeStep({
  knownIntents, scope, onChange, customIntent, onCustomChange,
  unknownFallback, onUnknownFallbackChange,
}: {
  knownIntents: string[];
  scope: string[];
  onChange: (next: string[]) => void;
  customIntent: string;
  onCustomChange: (v: string) => void;
  unknownFallback: UnknownFallback;
  onUnknownFallbackChange: (v: UnknownFallback) => void;
}) {
  const isAll = scope.length === 0;
  const toggle = (intent: string) => {
    if (scope.includes(intent)) onChange(scope.filter((i) => i !== intent));
    else onChange([...scope, intent]);
  };
  const addCustom = () => {
    const v = customIntent.trim().toLowerCase().replace(/\s+/g, "_");
    if (!v) return;
    if (!scope.includes(v)) onChange([...scope, v]);
    onCustomChange("");
  };
  return (
    <div className="space-y-4 py-2">
      <p className="text-meta text-muted-foreground">
        Restrict this template's rules to specific user intents. The intent
        classifier must be enabled for routing to take effect — when a request's
        detected intent isn't in this list, the template's rules are skipped.
      </p>

      <div className="rounded-md border border-border surface-2 p-3">
        <label className="flex items-start gap-2 cursor-pointer">
          <Checkbox
            checked={isAll}
            onCheckedChange={(v) => { if (v) onChange([]); }}
            className="mt-0.5"
          />
          <span className="space-y-0.5">
            <span className="text-body block">Apply to all intents</span>
            <span className="text-meta text-muted-foreground">
              Default — rules run on every request regardless of detected intent.
            </span>
          </span>
        </label>
      </div>

      <div>
        <Label className="text-meta uppercase tracking-wider text-muted-foreground">
          Limit to these intents
        </Label>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {knownIntents.map((intent) => {
            const on = scope.includes(intent);
            return (
              <button
                type="button"
                key={intent}
                onClick={() => toggle(intent)}
                className={cn(
                  "px-2.5 py-1 rounded-full border text-meta font-mono transition-colors",
                  on
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border surface-2 text-muted-foreground hover:text-foreground",
                )}
              >
                {intent}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex gap-2">
          <Input
            value={customIntent}
            onChange={(e) => onCustomChange(e.target.value)}
            placeholder="Add custom intent (e.g. billing)"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
          />
          <Button type="button" variant="outline" onClick={addCustom} disabled={!customIntent.trim()}>
            Add
          </Button>
        </div>
        {scope.length > 0 && (
          <p className="text-meta text-muted-foreground mt-2 tabular-nums">
            {scope.length} intent{scope.length === 1 ? "" : "s"} selected
          </p>
        )}
      </div>

      <div className="rounded-md border border-border surface-2 p-3 space-y-2">
        <div>
          <Label className="text-meta uppercase tracking-wider text-muted-foreground">
            Fallback when intent can't be detected
          </Label>
          <p className="text-meta text-muted-foreground mt-1">
            Controls what happens when the classifier is disabled, returns no
            match, or returns an intent outside this template's scope.
          </p>
        </div>
        <div className="space-y-1.5">
          {FALLBACK_OPTIONS.map((opt) => {
            const on = unknownFallback === opt.value;
            return (
              <label
                key={opt.value}
                className={cn(
                  "flex items-start gap-2 cursor-pointer rounded-md border p-2.5 transition-colors",
                  on ? "border-primary bg-primary/5" : "border-border surface-2 hover:bg-muted/40",
                )}
              >
                <input
                  type="radio"
                  name="unknown-fallback"
                  className="mt-1 accent-primary"
                  checked={on}
                  onChange={() => onUnknownFallbackChange(opt.value)}
                />
                <span className="space-y-0.5">
                  <span className="text-body block">{opt.label}</span>
                  <span className="text-meta text-muted-foreground">{opt.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </div>
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
  intentScope,
}: {
  name: string;
  description: string;
  includeKeywords: boolean;
  policy: Record<string, any>;
  settings: Record<string, unknown>;
  rules: Rule[];
  intentScope: string[];
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
      <div className="rounded-md border border-border surface-2 p-3">
        <div className="text-meta uppercase tracking-wider text-muted-foreground mb-1.5">Intent routing</div>
        {intentScope.length === 0 ? (
          <div className="text-meta text-muted-foreground">All intents (no routing)</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {intentScope.map((i) => (
              <Badge key={i} variant="outline" className="text-[10px] font-mono">{i}</Badge>
            ))}
          </div>
        )}
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
