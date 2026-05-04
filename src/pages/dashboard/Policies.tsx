import { useState, useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PoliciesV2Crud } from "@/components/policies/policies-v2-crud";
import { PolicyTemplatesSection } from "@/components/policies/policy-templates-section";
import { KnownIntentsSection } from "@/components/policies/known-intents-section";
import { GuardrailsSection } from "@/components/policies/guardrails-section";
import { CompressionSection } from "@/components/policies/compression-section";
import { TokenAlertsSection } from "@/components/policies/token-alerts-section";
import { Shield, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Section ids match what each subcomponent renders so the in-page nav can
// jump straight to a section. The `advanced` flag controls whether the
// section appears by default — power users flip the toggle in the header
// to surface them. Sections still render in their fixed visual order.
const SECTIONS = [
  { id: "guardrails",  label: "Guardrails",        hint: "What's blocked, allowed, and flagged",   advanced: false },
  { id: "compression", label: "Compression",       hint: "Trim noisy prompts before forwarding",   advanced: false },
  { id: "alerts",      label: "Alerts",            hint: "Get notified on block / token spikes",   advanced: false },
  { id: "templates",   label: "Templates",         hint: "Saved policy bundles you can re-apply",  advanced: true  },
  { id: "intents",     label: "Known intents",     hint: "Catalog of intents your classifier sees", advanced: true  },
  { id: "rules",       label: "Rules & detectors", hint: "Regex + structural detectors",           advanced: true  },
] as const;

const SHOW_ADVANCED_KEY = "anveguard.policies.show_advanced";

function useShowAdvanced(): [boolean, (v: boolean) => void] {
  const [show, setShow] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem(SHOW_ADVANCED_KEY) === "1"; } catch { return false; }
  });
  const update = (v: boolean) => {
    setShow(v);
    try { localStorage.setItem(SHOW_ADVANCED_KEY, v ? "1" : "0"); } catch { /* private mode */ }
  };
  return [show, update];
}

const Policies = () => {
  const [showAdvanced, setShowAdvanced] = useShowAdvanced();
  const visibleSections = useMemo(
    () => SECTIONS.filter((s) => showAdvanced || !s.advanced),
    [showAdvanced],
  );
  const advancedCount = useMemo(() => SECTIONS.filter((s) => s.advanced).length, []);

  return (
    <div className="px-4 md:px-6 py-5 space-y-5 max-w-6xl mx-auto">
      <PageHeader
        title="Policies"
        description={
          showAdvanced
            ? "What AnveGuard blocks, flags, or sanitizes — plus the rules and templates that drive every verdict."
            : "What AnveGuard blocks, flags, or sanitizes for your workspace. Set guardrails, get alerts, save tokens."
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setShowAdvanced(!showAdvanced);
                toast.success(showAdvanced
                  ? "Showing essential controls only"
                  : `Showing all ${SECTIONS.length} policy sections`);
              }}
              aria-pressed={showAdvanced}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 h-8 text-meta text-muted-foreground hover:text-foreground hover:border-border-strong transition-colors"
              title={showAdvanced
                ? "Hide power-user controls (Templates, Known intents, Rules & detectors)"
                : `Reveal ${advancedCount} power-user policy controls`}
            >
              <span>{showAdvanced ? "Simple view" : `Advanced (${advancedCount})`}</span>
              <span className={cn(
                "inline-flex h-3.5 w-6 items-center rounded-full border border-border transition-colors",
                showAdvanced ? "bg-primary/30" : "bg-transparent",
              )}>
                <span className={cn(
                  "inline-block h-2.5 w-2.5 rounded-full bg-foreground/60 transition-transform",
                  showAdvanced ? "translate-x-3" : "translate-x-0.5",
                )} />
              </span>
            </button>
            <Button asChild variant="outline" size="sm">
              <a href="/dashboard/policies/sandbox" aria-label="Open the policy sandbox">
                <FlaskConical className="h-4 w-4" aria-hidden="true" />
                Test in sandbox
              </a>
            </Button>
          </div>
        }
      />

      {/* In-page section nav — sticky chips so the page feels navigable
          rather than an endless scroll of stacked forms. Reflects whichever
          subset is visible (essentials only by default; all 6 in advanced). */}
      <nav
        aria-label="Sections on this page"
        className="sticky top-12 z-10 -mx-4 md:-mx-6 px-4 md:px-6 py-2 bg-background/85 backdrop-blur border-b border-border"
      >
        <ul className="flex flex-wrap gap-1.5">
          {visibleSections.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                title={s.hint}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-meta text-muted-foreground hover:text-foreground hover:border-border-strong transition-colors"
              >
                <Shield className="h-3 w-3 opacity-60" aria-hidden="true" />
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* Essentials — always visible. Cover what 90% of operators need. */}
      <section id="guardrails"  aria-label="Guardrails section"><GuardrailsSection /></section>
      <section id="compression" aria-label="Compression section"><CompressionSection /></section>
      <section id="alerts"      aria-label="Alerts section"><TokenAlertsSection /></section>

      {/* Advanced — policy-engineering surface. Hidden by default to keep
          the page focused for new users; one-click toggle reveals them. */}
      {showAdvanced && (
        <>
          <section id="templates"   aria-label="Templates section"><PolicyTemplatesSection /></section>
          <section id="intents"     aria-label="Known intents section"><KnownIntentsSection /></section>
          <section id="rules"       aria-label="Rules & detectors section"><PoliciesV2Crud /></section>
        </>
      )}
    </div>
  );
};

export default Policies;
