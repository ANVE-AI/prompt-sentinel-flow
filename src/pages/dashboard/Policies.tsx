import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PoliciesV2Crud } from "@/components/policies/policies-v2-crud";
import { PolicyTemplatesSection } from "@/components/policies/policy-templates-section";
import { KnownIntentsSection } from "@/components/policies/known-intents-section";
import { GuardrailsSection } from "@/components/policies/guardrails-section";
import { CompressionSection } from "@/components/policies/compression-section";
import { TokenAlertsSection } from "@/components/policies/token-alerts-section";

const Policies = () => {
  return (
    <div className="px-4 md:px-6 py-5 space-y-5 max-w-6xl mx-auto">
      <PageHeader
        title="Policies v2"
        description="Manage keywords, regex rules, detectors, intents, and behavior settings."
        actions={
          <Button asChild variant="outline">
            <a href="/dashboard/policies/sandbox">Open sandbox</a>
          </Button>
        }
      />
      <GuardrailsSection />
      <CompressionSection />
      <TokenAlertsSection />
      <PolicyTemplatesSection />
      <KnownIntentsSection />
      <PoliciesV2Crud />
    </div>
  );
};

export default Policies;
