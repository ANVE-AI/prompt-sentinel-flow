import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check, Copy, Plug, KeyRound, Sparkles, ChevronDown, BookOpen, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PROXY_BASE_URL = "https://api.anveguard.dev/v1";

type Step = {
  icon: typeof Plug;
  title: string;
  body: ReactNode;
  ctaLabel: string;
  ctaTo: string;
  snippet?: { label: string; code: string };
};

/**
 * Self-contained quickstart that lives on signed-out surfaces (landing,
 * sign-in, sign-up). Unlike the dashboard's progress-aware NextStepCard,
 * this panel doesn't read user state — it just lays out the 3 setup steps
 * with copyable snippets so a brand-new visitor can read end-to-end and
 * understand what they'll do *before* opening the dashboard.
 *
 * Each step's CTA links into the dashboard route; Clerk's auth gate will
 * route through sign-in if needed and forward the user to the destination.
 *
 * Variants:
 *   - "full"   — landing-page width, side-by-side body + snippet
 *   - "compact" — narrow auth-page column, stacked
 */
export function QuickstartHelpPanel({
  variant = "full",
  defaultOpen = true,
}: {
  variant?: "full" | "compact";
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const steps: Step[] = [
    {
      icon: Plug,
      title: "Create an upstream endpoint",
      body: (
        <>
          Go to <strong>Endpoints</strong> and add the provider you want to guard
          (OpenAI, Anthropic, Perplexity, or your own host). Paste your provider
          API key — it's stored encrypted and never exposed to clients.
        </>
      ),
      ctaLabel: "Open Endpoints",
      ctaTo: "/dashboard/endpoints",
    },
    {
      icon: KeyRound,
      title: "Generate an AnveGuard key",
      body: (
        <>
          On <strong>Keys</strong>, click <em>New key</em>, name it, and bind it
          to the endpoint you just created. You'll see an <code className="font-mono text-xs">ag_live_…</code>{" "}
          secret <strong>once</strong> — copy it now, only the hash is stored.
        </>
      ),
      ctaLabel: "Open Keys",
      ctaTo: "/dashboard/keys",
      snippet: {
        label: "Use your AnveGuard key",
        code: `export ANVEGUARD_KEY="ag_live_…"`,
      },
    },
    {
      icon: Sparkles,
      title: "Send a test request",
      body: (
        <>
          Open the <strong>Playground</strong> and pick your key, or run the curl
          below from any terminal. The proxy speaks the OpenAI Chat Completions
          API — no SDK changes needed.
        </>
      ),
      ctaLabel: "Open Playground",
      ctaTo: "/dashboard/playground",
      snippet: {
        label: "curl — first guarded request",
        code: `curl -N ${PROXY_BASE_URL}/chat/completions \\
  -H "Authorization: Bearer $ANVEGUARD_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o-mini",
    "stream": true,
    "messages": [{"role": "user", "content": "Hello"}]
  }'`,
      },
    },
  ];

  return (
    <div className={cn("rounded-lg border border-border surface-1 overflow-hidden", variant === "compact" && "text-sm")}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        <BookOpen className="h-4 w-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">Quickstart — finish setup in 3 steps</div>
          {!open && (
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Endpoint · Key · First request — copy-paste ready
            </div>
          )}
        </div>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <ol className="divide-y divide-border border-t border-border">
          {steps.map((s, i) => (
            <StepRow key={i} index={i} step={s} variant={variant} />
          ))}
        </ol>
      )}
    </div>
  );
}

function StepRow({ index, step, variant }: { index: number; step: Step; variant: "full" | "compact" }) {
  const Icon = step.icon;
  const stacked = variant === "compact";
  return (
    <li className="px-4 py-4">
      <div
        className={cn(
          "flex gap-4",
          stacked ? "flex-col" : "flex-col md:flex-row md:items-start",
        )}
      >
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="rounded-md bg-primary/10 text-primary p-2 shrink-0">
            <Icon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono">
              Step {index + 1}
            </div>
            <div className="font-semibold mt-0.5">{step.title}</div>
            <p className="text-muted-foreground text-[13px] mt-1 leading-relaxed">{step.body}</p>
            <div className="mt-2.5">
              <Button asChild size="sm" variant="outline">
                <Link to={step.ctaTo}>
                  {step.ctaLabel}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {step.snippet && (
          <div className={cn("min-w-0", stacked ? "" : "md:w-[42%] md:max-w-[420px]")}>
            <SnippetBlock label={step.snippet.label} code={step.snippet.code} />
          </div>
        )}
      </div>
    </li>
  );
}

function SnippetBlock({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      },
      () => {
        /* clipboard blocked — silently no-op; auth pages don't load Sonner */
      },
    );
  };
  return (
    <div className="rounded-md border border-border bg-muted/20">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/60">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        <Button type="button" size="sm" variant="ghost" onClick={handleCopy} className="h-6 px-2 text-xs">
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="px-3 py-2 text-[11px] font-mono leading-relaxed overflow-x-auto whitespace-pre">
        {code}
      </pre>
    </div>
  );
}
