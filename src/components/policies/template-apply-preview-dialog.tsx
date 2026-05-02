import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Loader2, MinusCircle, PlusCircle, RefreshCw } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDashboardApi } from "@/lib/api";
import { cn } from "@/lib/utils";

export type ApplyTemplate = {
  id: string;
  name: string;
  policy: Record<string, any>;
  settings: Record<string, any>;
  rules?: Array<Record<string, any>>;
};

const SETTING_LABELS: Record<string, string> = {
  enable_normalizer: "Normalizer",
  enable_patterns: "Pattern rules",
  enable_heuristics: "Heuristics",
  enable_intent: "Intent classifier",
  intent_shadow_mode: "Intent shadow mode",
  strict_mode: "Strict mode",
  enable_injection_guard: "Injection guard",
  injection_action: "Injection action",
  enable_behavioral: "Behavioral analysis",
  behavioral_action: "Behavioral action",
  throttle_window_minutes: "Throttle window (min)",
  throttle_flag_threshold: "Throttle threshold",
  enable_fuzzy_keywords: "Fuzzy keywords",
  enable_semantic_keywords: "Semantic keywords",
  semantic_threshold: "Semantic threshold",
  behavioral_churn_threshold: "Churn threshold",
  behavioral_persona_threshold: "Persona threshold",
  behavioral_encoding_ratio_step: "Encoding ratio step",
  behavioral_length_multiplier: "Length multiplier",
  workspace_purpose: "Workspace purpose",
};

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "on" : "off";
  return String(v);
}

function diffArray(current: string[], next: string[]) {
  const a = new Set(current);
  const b = new Set(next);
  return {
    added: [...b].filter((x) => !a.has(x)),
    removed: [...a].filter((x) => !b.has(x)),
    kept: [...a].filter((x) => b.has(x)),
  };
}

export function TemplateApplyPreviewDialog({
  open, onOpenChange, template, applying, onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  template: ApplyTemplate | null;
  applying: boolean;
  onConfirm: () => void;
}) {
  const { call } = useDashboardApi();

  const policiesQ = useQuery<{ policies: any }>({
    queryKey: ["policies"],
    queryFn: () => call("get_policies"),
    enabled: open && !!template,
  });
  const settingsQ = useQuery<{ settings: any }>({
    queryKey: ["policy_settings"],
    queryFn: () => call("get_policy_settings"),
    enabled: open && !!template,
  });
  const rulesQ = useQuery<{ rules: any[] }>({
    queryKey: ["policy_rules"],
    queryFn: () => call("list_policy_rules"),
    enabled: open && !!template,
  });

  const loading = policiesQ.isLoading || settingsQ.isLoading || rulesQ.isLoading;

  const diff = useMemo(() => {
    if (!template) return null;
    const curPolicy = policiesQ.data?.policies ?? {};
    const curSettings = settingsQ.data?.settings ?? {};
    const curRules = rulesQ.data?.rules ?? [];

    // Keywords (only included if the template carries those fields).
    const tplPolicy = template.policy ?? {};
    const hasPolicy = Object.keys(tplPolicy).length > 0;
    const blockedDiff = hasPolicy && Array.isArray(tplPolicy.blocked_keywords)
      ? diffArray(curPolicy.blocked_keywords ?? [], tplPolicy.blocked_keywords)
      : null;
    const allowedDiff = hasPolicy && Array.isArray(tplPolicy.allowed_keywords)
      ? diffArray(curPolicy.allowed_keywords ?? [], tplPolicy.allowed_keywords)
      : null;
    const messageChange = hasPolicy && tplPolicy.block_message
      && tplPolicy.block_message !== (curPolicy.block_message ?? "")
      ? { from: curPolicy.block_message ?? "", to: tplPolicy.block_message }
      : null;
    const globalDefaultsChange = hasPolicy && typeof tplPolicy.use_global_defaults === "boolean"
      && (curPolicy.use_global_defaults !== false) !== tplPolicy.use_global_defaults
      ? { from: curPolicy.use_global_defaults !== false, to: tplPolicy.use_global_defaults }
      : null;

    // Settings — only fields present in the template snapshot.
    const settingChanges: Array<{ key: string; from: unknown; to: unknown }> = [];
    for (const [k, v] of Object.entries(template.settings ?? {})) {
      const cur = curSettings?.[k];
      // Loose compare via JSON to handle numbers/strings/booleans.
      if (JSON.stringify(cur) !== JSON.stringify(v)) {
        settingChanges.push({ key: k, from: cur, to: v });
      }
    }

    // Rules — applying inserts new rows, never removes existing. Match by name+kind to flag duplicates.
    const tplRules = template.rules ?? [];
    const curRuleKeys = new Set(curRules.map((r) => `${r.kind}::${r.name}`));
    const newRules = tplRules.filter((r) => !curRuleKeys.has(`${r.kind}::${r.name}`));
    const dupeRules = tplRules.filter((r) => curRuleKeys.has(`${r.kind}::${r.name}`));

    return {
      blockedDiff, allowedDiff, messageChange, globalDefaultsChange,
      settingChanges, newRules, dupeRules,
      anyChange:
        (blockedDiff && (blockedDiff.added.length || blockedDiff.removed.length)) ||
        (allowedDiff && (allowedDiff.added.length || allowedDiff.removed.length)) ||
        messageChange || globalDefaultsChange ||
        settingChanges.length || newRules.length,
    };
  }, [template, policiesQ.data, settingsQ.data, rulesQ.data]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Apply "{template?.name}"?</DialogTitle>
          <DialogDescription>
            Preview of what will change in your live policy. Existing rules are
            never removed — applying only adds new ones.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[55vh] pr-2">
          {loading || !diff ? (
            <div className="py-8 text-center text-meta text-muted-foreground inline-flex items-center gap-2 w-full justify-center">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> computing diff…
            </div>
          ) : !diff.anyChange ? (
            <div className="py-8 text-center text-meta text-muted-foreground">
              No changes — your live policy already matches this template.
            </div>
          ) : (
            <div className="space-y-4 text-meta">
              {/* Settings */}
              {diff.settingChanges.length > 0 && (
                <Section title="Behavior settings" count={diff.settingChanges.length}>
                  <ul className="space-y-1">
                    {diff.settingChanges.map((c) => (
                      <li key={c.key} className="flex items-center gap-2 flex-wrap">
                        <RefreshCw className="h-3 w-3 text-amber-500 shrink-0" />
                        <span className="font-medium">{SETTING_LABELS[c.key] ?? c.key}</span>
                        <span className="text-muted-foreground">{fmt(c.from)}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <span>{fmt(c.to)}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {/* Block message + global defaults */}
              {(diff.messageChange || diff.globalDefaultsChange) && (
                <Section title="Policy options">
                  {diff.globalDefaultsChange && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <RefreshCw className="h-3 w-3 text-amber-500" />
                      <span className="font-medium">Use global defaults</span>
                      <span className="text-muted-foreground">{fmt(diff.globalDefaultsChange.from)}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span>{fmt(diff.globalDefaultsChange.to)}</span>
                    </div>
                  )}
                  {diff.messageChange && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <RefreshCw className="h-3 w-3 text-amber-500" />
                        <span className="font-medium">Block message</span>
                      </div>
                      <div className="text-muted-foreground line-through">"{diff.messageChange.from || "—"}"</div>
                      <div>"{diff.messageChange.to}"</div>
                    </div>
                  )}
                </Section>
              )}

              {/* Keywords */}
              {diff.blockedDiff && (diff.blockedDiff.added.length || diff.blockedDiff.removed.length) ? (
                <Section title="Blocked keywords">
                  <KeywordDiff added={diff.blockedDiff.added} removed={diff.blockedDiff.removed} />
                </Section>
              ) : null}
              {diff.allowedDiff && (diff.allowedDiff.added.length || diff.allowedDiff.removed.length) ? (
                <Section title="Allowed keywords">
                  <KeywordDiff added={diff.allowedDiff.added} removed={diff.allowedDiff.removed} />
                </Section>
              ) : null}

              {/* Rules */}
              {diff.newRules.length > 0 && (
                <Section title="New rules to add" count={diff.newRules.length}>
                  <ul className="space-y-1">
                    {diff.newRules.map((r, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <PlusCircle className="h-3 w-3 mt-0.5 text-emerald-500 shrink-0" />
                        <div className="min-w-0">
                          <div className="font-medium">{r.name}</div>
                          <div className="text-muted-foreground">
                            {r.kind} · {r.severity} · {r.direction}
                            {r.applies_to_intents?.length ? ` · intents: ${r.applies_to_intents.join(", ")}` : ""}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
              {diff.dupeRules.length > 0 && (
                <Section title="Already present (will be skipped or duplicated)" count={diff.dupeRules.length}>
                  <ul className="space-y-1 text-muted-foreground">
                    {diff.dupeRules.map((r, i) => (
                      <li key={i}>· {r.name} <span className="opacity-70">({r.kind})</span></li>
                    ))}
                  </ul>
                </Section>
              )}
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={applying || loading}>
            {applying ? "Applying…" : "Apply changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="uppercase tracking-wide text-muted-foreground text-meta">{title}</span>
        {typeof count === "number" && <Badge variant="outline" className="text-meta">{count}</Badge>}
      </div>
      <div className="rounded-md border border-border surface-1 p-2">{children}</div>
    </div>
  );
}

function KeywordDiff({ added, removed }: { added: string[]; removed: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {removed.map((k) => (
        <Badge key={`r-${k}`} variant="outline" className={cn("text-meta", "bg-destructive/10 text-destructive border-destructive/30")}>
          <MinusCircle className="h-3 w-3 mr-1" /> {k}
        </Badge>
      ))}
      {added.map((k) => (
        <Badge key={`a-${k}`} variant="outline" className={cn("text-meta", "bg-emerald-500/10 text-emerald-600 border-emerald-500/30")}>
          <PlusCircle className="h-3 w-3 mr-1" /> {k}
        </Badge>
      ))}
    </div>
  );
}
