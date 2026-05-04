import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PoliciesV2Crud } from "@/components/policies/policies-v2-crud";
import { PolicyTemplatesSection } from "@/components/policies/policy-templates-section";
import { KnownIntentsSection } from "@/components/policies/known-intents-section";
import { GuardrailsSection } from "@/components/policies/guardrails-section";
import { CompressionSection } from "@/components/policies/compression-section";
import { TokenAlertsSection } from "@/components/policies/token-alerts-section";
import { Shield, FlaskConical } from "lucide-react";

// Section ids match what each subcomponent renders so the in-page nav can
// jump straight to a section. We keep them short + memorable so the URL
// hash stays readable when the user shares a link to a specific section.
const SECTIONS = [
  { id: "guardrails",  label: "Guardrails",       hint: "What's blocked, allowed, and flagged" },
  { id: "compression", label: "Compression",      hint: "Trim noisy prompts before forwarding" },
  { id: "alerts",      label: "Alerts",           hint: "Get notified on block / token spikes" },
  { id: "templates",   label: "Templates",        hint: "Saved policy bundles you can re-apply" },
  { id: "intents",     label: "Known intents",    hint: "Catalog of intents your classifier sees" },
  { id: "rules",       label: "Rules & detectors", hint: "Regex + structural detectors" },
] as const;

const Policies = () => {
  return (
    <div className="px-4 md:px-6 py-5 space-y-5 max-w-6xl mx-auto">
      <PageHeader
        title="Policies"
        description="What AnveGuard blocks, flags, or sanitizes — plus the rules and templates that drive every verdict."
        actions={
          <Button asChild variant="outline" size="sm">
            <a href="/dashboard/policies/sandbox" aria-label="Open the policy sandbox">
              <FlaskConical className="h-4 w-4" aria-hidden="true" />
              Test in sandbox
            </a>
          </Button>
        }
      />

      {/* In-page section nav — sticky chips so the page feels navigable
          rather than an endless scroll of stacked forms. Each chip is a
          plain anchor so browser back/forward + Cmd-click work normally. */}
      <nav
        aria-label="Sections on this page"
        className="sticky top-12 z-10 -mx-4 md:-mx-6 px-4 md:px-6 py-2 bg-background/85 backdrop-blur border-b border-border"
      >
        <ul className="flex flex-wrap gap-1.5">
          {SECTIONS.map((s) => (
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

      <section id="guardrails"  aria-labelledby="guardrails-h"><GuardrailsSection /></section>
      <section id="compression" aria-labelledby="compression-h"><CompressionSection /></section>
      <section id="alerts"      aria-labelledby="alerts-h"><TokenAlertsSection /></section>
      <section id="templates"   aria-labelledby="templates-h"><PolicyTemplatesSection /></section>
      <section id="intents"     aria-labelledby="intents-h"><KnownIntentsSection /></section>
      <section id="rules"       aria-labelledby="rules-h"><PoliciesV2Crud /></section>
    </div>
  );
};

export default Policies;
