import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Activity, Brain, Pencil, Plus, Save, ShieldAlert, Sparkles, Trash2, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { KeywordChipInput } from "@/components/keyword-chip-input";
import { useDashboardApi } from "@/lib/api";
import { cn } from "@/lib/utils";

type PolicyDraft = {
  blocked_keywords: string[];
  allowed_keywords: string[];
  use_global_defaults: boolean;
  block_message: string;
};

type SettingsDraft = {
  enable_normalizer: boolean;
  enable_patterns: boolean;
  enable_heuristics: boolean;
  enable_intent: boolean;
  intent_shadow_mode: boolean;
  strict_mode: boolean;
  workspace_purpose: string;
  enable_injection_guard: boolean;
  injection_action: "block" | "sanitize" | "flag";
  enable_behavioral: boolean;
  behavioral_action: "block" | "flag";
  throttle_window_minutes: number;
  throttle_flag_threshold: number;
  enable_fuzzy_keywords: boolean;
  enable_semantic_keywords: boolean;
  semantic_threshold: number;
};

type IntentRow = { intent: string; action: "block" | "flag" | "allow"; min_confidence: number };

type Rule = {
  id?: string;
  name: string;
  kind: "regex" | "detector";
  severity: "low" | "med" | "high";
  direction: "input" | "output" | "both";
  enabled: boolean;
  config: Record<string, unknown>;
  applies_to_intents: string[];
};

const DEFAULT_POLICY: PolicyDraft = {
  blocked_keywords: [],
  allowed_keywords: [],
  use_global_defaults: true,
  block_message: "This request was blocked by your organization's AI policy.",
};

const DEFAULT_SETTINGS: SettingsDraft = {
  enable_normalizer: true,
  enable_patterns: true,
  enable_heuristics: true,
  enable_intent: false,
  intent_shadow_mode: true,
  strict_mode: false,
  workspace_purpose: "",
  enable_injection_guard: true,
  injection_action: "block",
  enable_behavioral: true,
  behavioral_action: "flag",
  throttle_window_minutes: 5,
  throttle_flag_threshold: 10,
  enable_fuzzy_keywords: true,
  enable_semantic_keywords: false,
  semantic_threshold: 0.78,
};

const DEFAULT_INTENTS = [
  "jailbreak", "prompt_injection", "data_exfiltration", "off_topic", "tool_abuse", "harassment", "other",
];

const DETECTORS = [
  { value: "system_prompt_leak", label: "System prompt leak" },
  { value: "tool_injection", label: "Tool injection" },
  { value: "credential_shape", label: "Credential shape" },
  { value: "url_exfil", label: "URL exfiltration" },
  { value: "role_impersonation", label: "Role impersonation" },
  { value: "pseudo_system_block", label: "Pseudo-system block" },
  { value: "encoded_density", label: "Encoded density" },
] as const;

function toSettings(raw: any): SettingsDraft {
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    workspace_purpose: raw?.workspace_purpose ?? "",
    semantic_threshold: Number(raw?.semantic_threshold ?? DEFAULT_SETTINGS.semantic_threshold),
    throttle_window_minutes: Number(raw?.throttle_window_minutes ?? DEFAULT_SETTINGS.throttle_window_minutes),
    throttle_flag_threshold: Number(raw?.throttle_flag_threshold ?? DEFAULT_SETTINGS.throttle_flag_threshold),
    behavioral_action: raw?.behavioral_action === "block" ? "block" : "flag",
  };
}

function emptyRule(kind: "regex" | "detector"): Rule {
  return {
    name: "",
    kind,
    severity: "high",
    direction: "both",
    enabled: true,
    config: kind === "regex" ? { pattern: "", flags: "i" } : { detector: DETECTORS[0].value },
    applies_to_intents: [],
  };
}

export function PoliciesV2Crud() {
  const { call } = useDashboardApi();
  const qc = useQueryClient();

  const policiesQ = useQuery<{ policies: any; global_defaults: string[] }>({
    queryKey: ["policies"],
    queryFn: () => call("get_policies"),
  });
  const settingsQ = useQuery<{ settings: any; known_intents: string[] }>({
    queryKey: ["policy_settings"],
    queryFn: () => call("get_policy_settings"),
  });
  const intentsQ = useQuery<{ intents: IntentRow[] }>({
    queryKey: ["policy_intents"],
    queryFn: () => call("list_policy_intents"),
  });
  const rulesQ = useQuery<{ rules: Rule[] }>({
    queryKey: ["policy_rules"],
    queryFn: () => call("list_policy_rules"),
  });

  const [policy, setPolicy] = useState<PolicyDraft>(DEFAULT_POLICY);
  const [settings, setSettings] = useState<SettingsDraft>(DEFAULT_SETTINGS);
  const [intentDrafts, setIntentDrafts] = useState<Record<string, IntentRow>>({});
  const [editingRule, setEditingRule] = useState<Rule | null>(null);

  const knownIntents = settingsQ.data?.known_intents ?? DEFAULT_INTENTS;
  const rules = rulesQ.data?.rules ?? [];
  const regexRules = rules.filter((rule) => rule.kind === "regex");
  const detectorRules = rules.filter((rule) => rule.kind === "detector");

  useEffect(() => {
    const row = policiesQ.data?.policies;
    if (!row) {
      setPolicy(DEFAULT_POLICY);
      return;
    }
    setPolicy({
      blocked_keywords: row.blocked_keywords ?? [],
      allowed_keywords: row.allowed_keywords ?? [],
      use_global_defaults: row.use_global_defaults !== false,
      block_message: row.block_message ?? DEFAULT_POLICY.block_message,
    });
  }, [policiesQ.data]);

  useEffect(() => {
    if (settingsQ.data?.settings) setSettings(toSettings(settingsQ.data.settings));
  }, [settingsQ.data]);

  useEffect(() => {
    const next: Record<string, IntentRow> = {};
    const existing = new Map((intentsQ.data?.intents ?? []).map((row) => [row.intent, row]));
    for (const intent of knownIntents) {
      next[intent] = existing.get(intent) ?? { intent, action: "flag", min_confidence: 0.7 };
    }
    setIntentDrafts(next);
  }, [intentsQ.data, knownIntents.join("|")]);

  const savePolicies = useMutation({
    mutationFn: () => call("save_policies", { body: policy }),
    onSuccess: () => { toast.success("Keyword policy saved"); qc.invalidateQueries({ queryKey: ["policies"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save keywords"),
  });

  const saveSettings = useMutation({
    mutationFn: () => call("save_policy_settings", { body: {
      ...settings,
      workspace_purpose: settings.workspace_purpose,
    } }),
    onSuccess: () => { toast.success("Policy settings saved"); qc.invalidateQueries({ queryKey: ["policy_settings"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save settings"),
  });

  const saveIntent = useMutation({
    mutationFn: (row: IntentRow) => call("save_policy_intent", { body: row }),
    onSuccess: () => { toast.success("Intent saved"); qc.invalidateQueries({ queryKey: ["policy_intents"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save intent"),
  });

  const resetIntent = useMutation({
    mutationFn: (intent: string) => call("delete_policy_intent", { body: { intent } }),
    onSuccess: () => { toast.success("Intent reset"); qc.invalidateQueries({ queryKey: ["policy_intents"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to reset intent"),
  });

  const saveRule = useMutation({
    mutationFn: (rule: Rule) => call("save_policy_rule", { body: rule }),
    onSuccess: () => {
      toast.success("Rule saved");
      setEditingRule(null);
      qc.invalidateQueries({ queryKey: ["policy_rules"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save rule"),
  });

  const deleteRule = useMutation({
    mutationFn: (id: string) => call("delete_policy_rule", { body: { id } }),
    onSuccess: () => { toast.success("Rule deleted"); qc.invalidateQueries({ queryKey: ["policy_rules"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to delete rule"),
  });

  const isLoading = policiesQ.isLoading || settingsQ.isLoading || intentsQ.isLoading || rulesQ.isLoading;
  const stats = useMemo(() => ([
    { label: "Blocked keywords", value: policy.blocked_keywords.length },
    { label: "Regex rules", value: regexRules.length },
    { label: "Detectors", value: detectorRules.length },
    { label: "Intent actions", value: Object.keys(intentDrafts).length },
  ]), [policy.blocked_keywords.length, regexRules.length, detectorRules.length, intentDrafts]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid sm:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>
        <Skeleton className="h-[520px] rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-4 gap-3">
        {stats.map((item) => (
          <div key={item.label} className="rounded-lg border border-border surface-1 p-4">
            <div className="text-meta text-muted-foreground">{item.label}</div>
            <div className="text-display tabular-nums mt-1">{item.value}</div>
          </div>
        ))}
      </div>

      <Tabs defaultValue="keywords" className="space-y-4">
        <TabsList className="grid grid-cols-5 w-full surface-1 border border-border h-auto p-1">
          <TabsTrigger value="keywords">Keywords</TabsTrigger>
          <TabsTrigger value="regex">Regex rules</TabsTrigger>
          <TabsTrigger value="detectors">Detectors</TabsTrigger>
          <TabsTrigger value="intents">Intents</TabsTrigger>
          <TabsTrigger value="behavior">Behavior</TabsTrigger>
        </TabsList>

        <TabsContent value="keywords" className="mt-0">
          <PolicyCard
            eyebrow="Policies v2"
            title="Keyword guardrails"
            icon={<ShieldAlert className="h-4 w-4 text-primary" />}
            action={<Button onClick={() => savePolicies.mutate()} disabled={savePolicies.isPending}><Save className="h-3.5 w-3.5 mr-1" />{savePolicies.isPending ? "Saving…" : "Save"}</Button>}
          >
            <div className="space-y-5">
              <ToggleLine
                label="Global defaults"
                value={policy.use_global_defaults}
                onChange={(value) => setPolicy((draft) => ({ ...draft, use_global_defaults: value }))}
              />
              {policy.use_global_defaults && (
                <div className="rounded-md border border-border surface-2 p-3 flex flex-wrap gap-1.5">
                  {(policiesQ.data?.global_defaults ?? []).map((term) => <Badge key={term} variant="outline" className="font-mono">{term}</Badge>)}
                </div>
              )}
              <div className="grid lg:grid-cols-2 gap-5">
                <div>
                  <Label htmlFor="blocked_keywords">Blocked keywords</Label>
                  <KeywordChipInput
                    id="blocked_keywords"
                    value={policy.blocked_keywords}
                    onChange={(blocked_keywords) => setPolicy((draft) => ({ ...draft, blocked_keywords }))}
                    placeholder="Add a blocked keyword"
                  />
                  <div className="text-meta text-muted-foreground mt-2 tabular-nums">{policy.blocked_keywords.length} entries</div>
                </div>
                <div>
                  <Label htmlFor="allowed_keywords">Allowed keywords</Label>
                  <KeywordChipInput
                    id="allowed_keywords"
                    value={policy.allowed_keywords}
                    onChange={(allowed_keywords) => setPolicy((draft) => ({ ...draft, allowed_keywords }))}
                    placeholder="Add an allowlist exception"
                  />
                  <div className="text-meta text-muted-foreground mt-2 tabular-nums">{policy.allowed_keywords.length} entries</div>
                </div>
              </div>
              <div>
                <Label htmlFor="block_message">Block message</Label>
                <Input
                  id="block_message"
                  value={policy.block_message}
                  onChange={(event) => setPolicy((draft) => ({ ...draft, block_message: event.target.value }))}
                  className="mt-1.5 surface-2 border-border"
                />
              </div>
              <div className="grid lg:grid-cols-2 gap-3">
                <ToggleLine label="Fuzzy keyword matching" value={settings.enable_fuzzy_keywords} onChange={(value) => setSettings((draft) => ({ ...draft, enable_fuzzy_keywords: value }))} />
                <ToggleLine label="Semantic keyword matching" value={settings.enable_semantic_keywords} onChange={(value) => setSettings((draft) => ({ ...draft, enable_semantic_keywords: value }))} />
              </div>
              <div className={cn("rounded-md border border-border surface-2 p-3", !settings.enable_semantic_keywords && "opacity-50 pointer-events-none")}>
                <Label htmlFor="semantic_threshold">Semantic threshold <span className="tabular-nums text-muted-foreground">{settings.semantic_threshold.toFixed(2)}</span></Label>
                <Input
                  id="semantic_threshold"
                  type="range"
                  min={0.5}
                  max={0.95}
                  step={0.01}
                  value={settings.semantic_threshold}
                  onChange={(event) => setSettings((draft) => ({ ...draft, semantic_threshold: Number(event.target.value) }))}
                  className="mt-2"
                />
              </div>
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>Save matching settings</Button>
              </div>
            </div>
          </PolicyCard>
        </TabsContent>

        <TabsContent value="regex" className="mt-0">
          <PolicyCard
            eyebrow="Rules"
            title="Regex rules"
            icon={<Sparkles className="h-4 w-4 text-primary" />}
            action={<Button onClick={() => setEditingRule(emptyRule("regex"))}><Plus className="h-3.5 w-3.5 mr-1" />New regex</Button>}
          >
            <div className="space-y-4">
              <ToggleLine label="Pattern layer" value={settings.enable_patterns} onChange={(value) => setSettings((draft) => ({ ...draft, enable_patterns: value }))} />
              {editingRule?.kind === "regex" && <RuleEditor rule={editingRule} knownIntents={knownIntents} saving={saveRule.isPending} onCancel={() => setEditingRule(null)} onSave={(rule) => saveRule.mutate(rule)} />}
              <RuleList rules={regexRules} onEdit={setEditingRule} onDelete={(rule) => rule.id && deleteRule.mutate(rule.id)} empty="No regex rules configured." />
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>Save layer setting</Button>
              </div>
            </div>
          </PolicyCard>
        </TabsContent>

        <TabsContent value="detectors" className="mt-0">
          <PolicyCard
            eyebrow="Rules"
            title="Structural detectors"
            icon={<Activity className="h-4 w-4 text-primary" />}
            action={<Button onClick={() => setEditingRule(emptyRule("detector"))}><Plus className="h-3.5 w-3.5 mr-1" />New detector</Button>}
          >
            <div className="space-y-4">
              <div className="grid lg:grid-cols-2 gap-3">
                <ToggleLine label="Pattern detectors" value={settings.enable_patterns} onChange={(value) => setSettings((draft) => ({ ...draft, enable_patterns: value }))} />
                <ToggleLine label="Built-in heuristics" value={settings.enable_heuristics} onChange={(value) => setSettings((draft) => ({ ...draft, enable_heuristics: value }))} />
              </div>
              {editingRule?.kind === "detector" && <RuleEditor rule={editingRule} knownIntents={knownIntents} saving={saveRule.isPending} onCancel={() => setEditingRule(null)} onSave={(rule) => saveRule.mutate(rule)} />}
              <div className="grid md:grid-cols-2 gap-2">
                {DETECTORS.map((detector) => (
                  <div key={detector.value} className="rounded-md border border-border surface-2 p-3">
                    <div className="font-medium text-body">{detector.label}</div>
                    <div className="text-meta text-muted-foreground font-mono mt-1">{detector.value}</div>
                  </div>
                ))}
              </div>
              <RuleList rules={detectorRules} onEdit={setEditingRule} onDelete={(rule) => rule.id && deleteRule.mutate(rule.id)} empty="No detector rules configured." />
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>Save detector settings</Button>
              </div>
            </div>
          </PolicyCard>
        </TabsContent>

        <TabsContent value="intents" className="mt-0">
          <PolicyCard
            eyebrow="Classifier"
            title="Intent actions"
            icon={<Brain className="h-4 w-4 text-primary" />}
            action={<Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}><Save className="h-3.5 w-3.5 mr-1" />{saveSettings.isPending ? "Saving…" : "Save settings"}</Button>}
          >
            <div className="space-y-5">
              <div className="grid md:grid-cols-3 gap-3">
                <ToggleLine label="Classifier" value={settings.enable_intent} onChange={(value) => setSettings((draft) => ({ ...draft, enable_intent: value }))} />
                <ToggleLine label="Shadow mode" value={settings.intent_shadow_mode} onChange={(value) => setSettings((draft) => ({ ...draft, intent_shadow_mode: value }))} disabled={!settings.enable_intent} />
                <ToggleLine label="Strict mode" value={settings.strict_mode} onChange={(value) => setSettings((draft) => ({ ...draft, strict_mode: value }))} />
              </div>
              <div>
                <Label htmlFor="workspace_purpose">Workspace purpose</Label>
                <Textarea
                  id="workspace_purpose"
                  rows={3}
                  value={settings.workspace_purpose}
                  onChange={(event) => setSettings((draft) => ({ ...draft, workspace_purpose: event.target.value }))}
                  className="mt-1.5 surface-2 border-border"
                />
              </div>
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="surface-2 text-muted-foreground">
                    <tr>
                      <th className="text-left font-normal px-4 py-2">Intent</th>
                      <th className="text-left font-normal px-4 py-2 w-36">Action</th>
                      <th className="text-left font-normal px-4 py-2 w-48">Confidence</th>
                      <th className="text-right font-normal px-4 py-2 w-32">CRUD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {knownIntents.map((intent) => {
                      const row = intentDrafts[intent] ?? { intent, action: "flag" as const, min_confidence: 0.7 };
                      return (
                        <tr key={intent} className="border-t border-border">
                          <td className="px-4 py-2 font-mono text-meta">{intent}</td>
                          <td className="px-4 py-2">
                            <Select value={row.action} onValueChange={(action) => setIntentDrafts((draft) => ({ ...draft, [intent]: { ...row, action: action as IntentRow["action"] } }))}>
                              <SelectTrigger className="h-8 surface-2 border-border"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="block">Block</SelectItem>
                                <SelectItem value="flag">Flag</SelectItem>
                                <SelectItem value="allow">Allow</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                min={0}
                                max={1}
                                step={0.05}
                                value={row.min_confidence}
                                onChange={(event) => setIntentDrafts((draft) => ({ ...draft, [intent]: { ...row, min_confidence: Number(event.target.value) } }))}
                                className="h-8 surface-2 border-border"
                              />
                              <span className="text-meta text-muted-foreground tabular-nums w-10">{Math.round(row.min_confidence * 100)}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex justify-end gap-1">
                              <Button size="icon" variant="ghost" onClick={() => saveIntent.mutate(row)} aria-label={`Save ${intent}`}>
                                <Save className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => resetIntent.mutate(intent)} aria-label={`Reset ${intent}`}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </PolicyCard>
        </TabsContent>

        <TabsContent value="behavior" className="mt-0">
          <PolicyCard
            eyebrow="Runtime controls"
            title="Injection and behavior settings"
            icon={<Activity className="h-4 w-4 text-primary" />}
            action={<Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}><Save className="h-3.5 w-3.5 mr-1" />{saveSettings.isPending ? "Saving…" : "Save"}</Button>}
          >
            <div className="space-y-5">
              <div className="grid lg:grid-cols-3 gap-3">
                <ToggleLine label="Normalizer" value={settings.enable_normalizer} onChange={(value) => setSettings((draft) => ({ ...draft, enable_normalizer: value }))} />
                <ToggleLine label="Injection guard" value={settings.enable_injection_guard} onChange={(value) => setSettings((draft) => ({ ...draft, enable_injection_guard: value }))} />
                <ToggleLine label="Behavioral heuristics" value={settings.enable_behavioral} onChange={(value) => setSettings((draft) => ({ ...draft, enable_behavioral: value }))} />
              </div>
              <div className="grid lg:grid-cols-2 gap-4">
                <div className="rounded-md border border-border surface-2 p-4 space-y-3">
                  <Label>Injection action</Label>
                  <Select value={settings.injection_action} onValueChange={(injection_action) => setSettings((draft) => ({ ...draft, injection_action: injection_action as SettingsDraft["injection_action"] }))}>
                    <SelectTrigger className="surface-1 border-border"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="block">Block</SelectItem>
                      <SelectItem value="sanitize">Sanitize</SelectItem>
                      <SelectItem value="flag">Flag</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded-md border border-border surface-2 p-4 space-y-3">
                  <Label>Behavior action</Label>
                  <Select value={settings.behavioral_action} onValueChange={(behavioral_action) => setSettings((draft) => ({ ...draft, behavioral_action: behavioral_action as SettingsDraft["behavioral_action"] }))}>
                    <SelectTrigger className="surface-1 border-border"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="flag">Flag</SelectItem>
                      <SelectItem value="block">Block</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="rounded-md border border-border surface-2 p-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="throttle_window_minutes">Throttle window minutes</Label>
                    <Input
                      id="throttle_window_minutes"
                      type="number"
                      min={1}
                      max={1440}
                      value={settings.throttle_window_minutes}
                      onChange={(event) => setSettings((draft) => ({ ...draft, throttle_window_minutes: Number(event.target.value) || 1 }))}
                      className="mt-1.5 surface-1 border-border"
                    />
                  </div>
                  <div>
                    <Label htmlFor="throttle_flag_threshold">Throttle flag threshold</Label>
                    <Input
                      id="throttle_flag_threshold"
                      type="number"
                      min={0}
                      max={100000}
                      value={settings.throttle_flag_threshold}
                      onChange={(event) => setSettings((draft) => ({ ...draft, throttle_flag_threshold: Math.max(0, Number(event.target.value) || 0) }))}
                      className="mt-1.5 surface-1 border-border"
                    />
                  </div>
                </div>
              </div>
            </div>
          </PolicyCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PolicyCard({ eyebrow, title, icon, action, children }: { eyebrow: string; title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="surface-1 border-border">
      <div className="px-5 pt-4 pb-3 border-b border-border flex items-start justify-between gap-3">
        <div>
          <div className="text-meta uppercase text-muted-foreground">{eyebrow}</div>
          <div className="text-h2 font-medium mt-0.5 flex items-center gap-2">{icon}{title}</div>
        </div>
        {action}
      </div>
      <CardContent className="p-5">{children}</CardContent>
    </Card>
  );
}

function ToggleLine({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <div className={cn("rounded-md border border-border surface-2 p-3 flex items-center justify-between gap-3", disabled && "opacity-50")}>
      <span className="font-medium text-body">{label}</span>
      <Switch checked={value} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

function RuleList({ rules, onEdit, onDelete, empty }: { rules: Rule[]; onEdit: (rule: Rule) => void; onDelete: (rule: Rule) => void; empty: string }) {
  if (rules.length === 0) return <div className="rounded-md border border-dashed border-border p-5 text-center text-muted-foreground text-body">{empty}</div>;

  return (
    <div className="space-y-2">
      {rules.map((rule) => (
        <div key={rule.id} className="rounded-md border border-border surface-2 p-3 flex flex-col md:flex-row md:items-center gap-3">
          <Badge variant="outline" className="w-fit font-mono">{rule.kind}</Badge>
          <div className="min-w-0 flex-1">
            <div className="font-medium truncate">{rule.name}</div>
            <div className="text-meta text-muted-foreground font-mono truncate">
              {rule.kind === "regex" ? `/${String(rule.config?.pattern ?? "")}/${String(rule.config?.flags ?? "i")}` : String(rule.config?.detector ?? "")}
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            <Badge variant="secondary">{rule.enabled ? "enabled" : "disabled"}</Badge>
            <Badge variant="outline">{rule.severity}</Badge>
            <Badge variant="outline">{rule.direction}</Badge>
            {(rule.applies_to_intents ?? []).length === 0 ? <Badge variant="outline">all intents</Badge> : rule.applies_to_intents.map((intent) => <Badge key={intent} variant="outline" className="font-mono">{intent}</Badge>)}
          </div>
          <div className="flex gap-1 md:justify-end">
            <Button size="icon" variant="ghost" onClick={() => onEdit(rule)} aria-label={`Edit ${rule.name}`}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button size="icon" variant="ghost" onClick={() => onDelete(rule)} aria-label={`Delete ${rule.name}`}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function RuleEditor({ rule, knownIntents, saving, onSave, onCancel }: { rule: Rule; knownIntents: string[]; saving: boolean; onSave: (rule: Rule) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<Rule>(rule);
  useEffect(() => setDraft(rule), [rule]);

  const setConfig = (patch: Record<string, unknown>) => setDraft((value) => ({ ...value, config: { ...value.config, ...patch } }));
  const toggleIntent = (intent: string) => setDraft((value) => ({
    ...value,
    applies_to_intents: value.applies_to_intents.includes(intent)
      ? value.applies_to_intents.filter((item) => item !== intent)
      : [...value.applies_to_intents, intent],
  }));

  return (
    <div className="rounded-md border border-primary/40 surface-2 p-4 space-y-4">
      <div className="grid lg:grid-cols-[1fr_320px] gap-3">
        <div>
          <Label htmlFor="rule_name">Rule name</Label>
          <Input id="rule_name" value={draft.name} onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))} className="mt-1.5 surface-1 border-border" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label>Severity</Label>
            <Select value={draft.severity} onValueChange={(severity) => setDraft((value) => ({ ...value, severity: severity as Rule["severity"] }))}>
              <SelectTrigger className="mt-1.5 surface-1 border-border"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="high">High</SelectItem><SelectItem value="med">Medium</SelectItem><SelectItem value="low">Low</SelectItem></SelectContent>
            </Select>
          </div>
          <div>
            <Label>Direction</Label>
            <Select value={draft.direction} onValueChange={(direction) => setDraft((value) => ({ ...value, direction: direction as Rule["direction"] }))}>
              <SelectTrigger className="mt-1.5 surface-1 border-border"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="both">Both</SelectItem><SelectItem value="input">Input</SelectItem><SelectItem value="output">Output</SelectItem></SelectContent>
            </Select>
          </div>
          <ToggleLine label="Enabled" value={draft.enabled} onChange={(enabled) => setDraft((value) => ({ ...value, enabled }))} />
        </div>
      </div>

      {draft.kind === "regex" ? (
        <div className="grid lg:grid-cols-[1fr_120px] gap-3">
          <div>
            <Label htmlFor="rule_pattern">Pattern</Label>
            <Input id="rule_pattern" value={String(draft.config.pattern ?? "")} onChange={(event) => setConfig({ pattern: event.target.value })} className="mt-1.5 surface-1 border-border font-mono" />
          </div>
          <div>
            <Label htmlFor="rule_flags">Flags</Label>
            <Input id="rule_flags" value={String(draft.config.flags ?? "i")} onChange={(event) => setConfig({ flags: event.target.value })} className="mt-1.5 surface-1 border-border font-mono" />
          </div>
        </div>
      ) : (
        <div>
          <Label>Detector</Label>
          <Select value={String(draft.config.detector ?? DETECTORS[0].value)} onValueChange={(detector) => setConfig({ detector })}>
            <SelectTrigger className="mt-1.5 surface-1 border-border"><SelectValue /></SelectTrigger>
            <SelectContent>{DETECTORS.map((detector) => <SelectItem key={detector.value} value={detector.value}>{detector.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}

      <div>
        <Label>Intent scope</Label>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {knownIntents.map((intent) => {
            const active = draft.applies_to_intents.includes(intent);
            return (
              <button
                key={intent}
                type="button"
                onClick={() => toggleIntent(intent)}
                className={cn(
                  "text-meta font-mono px-2 py-1 rounded border transition-colors",
                  active ? "border-primary bg-primary/15 text-primary" : "border-border surface-1 text-muted-foreground hover:text-foreground",
                )}
              >
                {intent}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}><X className="h-3.5 w-3.5 mr-1" />Cancel</Button>
        <Button onClick={() => onSave(draft)} disabled={saving || !draft.name || (draft.kind === "regex" && !draft.config.pattern)}><Save className="h-3.5 w-3.5 mr-1" />{saving ? "Saving…" : "Save rule"}</Button>
      </div>
    </div>
  );
}