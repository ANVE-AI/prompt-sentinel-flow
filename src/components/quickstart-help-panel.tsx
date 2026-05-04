import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check, Copy, Plug, KeyRound, Sparkles, ChevronDown, BookOpen, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PROXY_BASE_URL = "https://api.anveguard.dev/v1";
const AUTH_HEADER_NAME = "Authorization";
const AUTH_HEADER_VALUE = "Bearer ag_live_…";

/**
 * Example upstreams the visitor can preview without leaving the panel. The
 * `path` and `body` differ per provider since Anthropic uses a different
 * route + payload shape from OpenAI-compatible providers.
 */
type ExampleEndpoint = {
  id: string;
  label: string;
  hint: string;
  path: string; // appended to PROXY_BASE_URL
  model: string;
  body: object;
};

const EXAMPLE_ENDPOINTS: ExampleEndpoint[] = [
  {
    id: "openai",
    label: "OpenAI",
    hint: "Chat Completions · gpt-4o-mini",
    path: "/chat/completions",
    model: "gpt-4o-mini",
    body: {
      model: "gpt-4o-mini",
      stream: true,
      messages: [{ role: "user", content: "Hello" }],
    },
  },
  {
    id: "anthropic",
    label: "Anthropic",
    hint: "Messages · claude-3-5-sonnet",
    path: "/messages",
    model: "claude-3-5-sonnet-latest",
    body: {
      model: "claude-3-5-sonnet-latest",
      max_tokens: 256,
      stream: true,
      messages: [{ role: "user", content: "Hello" }],
    },
  },
  {
    id: "perplexity",
    label: "Perplexity",
    hint: "Chat Completions · sonar",
    path: "/chat/completions",
    model: "sonar",
    body: {
      model: "sonar",
      stream: true,
      messages: [{ role: "user", content: "Hello" }],
    },
  },
  {
    id: "lovable",
    label: "Lovable AI",
    hint: "Chat Completions · gemini-2.5-flash",
    path: "/chat/completions",
    model: "google/gemini-2.5-flash",
    body: {
      model: "google/gemini-2.5-flash",
      stream: true,
      messages: [{ role: "user", content: "Hello" }],
    },
  },
];

type Step = {
  icon: typeof Plug;
  title: string;
  body: ReactNode;
  ctaLabel: string;
  ctaTo: string;
  /** Custom render for the right-hand snippet column. */
  snippet?: ReactNode;
};

/**
 * Self-contained quickstart that lives on signed-out surfaces (landing,
 * sign-in, sign-up). Step 3 includes a provider switcher and three
 * individually copyable fields (proxy base URL, auth header, sample curl)
 * so users can test against the example endpoint they actually plan to use.
 */
export function QuickstartHelpPanel({
  variant = "full",
  defaultOpen = true,
}: {
  variant?: "full" | "compact";
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [exampleId, setExampleId] = useState<string>(EXAMPLE_ENDPOINTS[0].id);
  const example = useMemo(
    () => EXAMPLE_ENDPOINTS.find((e) => e.id === exampleId) ?? EXAMPLE_ENDPOINTS[0],
    [exampleId],
  );

  const fullUrl = `${PROXY_BASE_URL}${example.path}`;
  const sampleCurl = `curl -N ${fullUrl} \\
  -H "${AUTH_HEADER_NAME}: ${AUTH_HEADER_VALUE}" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(example.body, null, 2).replace(/\n/g, "\n    ")}'`;

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
          to the endpoint you just created. You'll see an{" "}
          <code className="font-mono text-xs">ag_live_…</code> secret{" "}
          <strong>once</strong> — copy it now, only the hash is stored.
        </>
      ),
      ctaLabel: "Open Keys",
      ctaTo: "/dashboard/keys",
      snippet: (
        <CopyField
          label="Set your AnveGuard key"
          value={`export ANVEGUARD_KEY="ag_live_…"`}
        />
      ),
    },
    {
      icon: Sparkles,
      title: "Send a test request",
      body: (
        <>
          Pick the provider you'll guard and copy the proxy URL, the auth
          header, and a ready-to-run sample. The proxy speaks the OpenAI Chat
          Completions API (and Anthropic Messages) — no SDK changes needed.
        </>
      ),
      ctaLabel: "Open Playground",
      ctaTo: "/dashboard/playground",
      snippet: (
        <div className="space-y-2.5">
          {/* Provider switcher — drives all three fields below */}
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLE_ENDPOINTS.map((e) => {
              const active = e.id === exampleId;
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setExampleId(e.id)}
                  title={e.hint}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[11px] border transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-border",
                  )}
                >
                  {e.label}
                </button>
              );
            })}
          </div>

          <CopyField label="Proxy base URL" value={fullUrl} mono />
          <CopyField
            label="Auth header"
            value={`${AUTH_HEADER_NAME}: ${AUTH_HEADER_VALUE}`}
            mono
          />
          <CopyField label={`Sample request — ${example.label}`} value={sampleCurl} block />
        </div>
      ),
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
          <div className={cn("min-w-0", stacked ? "" : "md:w-[46%] md:max-w-[460px]")}>
            {step.snippet}
          </div>
        )}
      </div>
    </li>
  );
}

/**
 * Copy-to-clipboard field used for both single-line values (proxy URL,
 * header) and full code blocks (curl). `block` swaps the inline pill layout
 * for a multi-line <pre>; `mono` formats single-line text as code.
 */
function CopyField({
  label,
  value,
  mono,
  block,
}: {
  label: string;
  value: string;
  mono?: boolean;
  block?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(
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
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-border/60">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider truncate">
          {label}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleCopy}
          className="h-6 px-2 text-xs shrink-0"
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      {block ? (
        <pre className="px-3 py-2 text-[11px] font-mono leading-relaxed overflow-x-auto whitespace-pre">
          {value}
        </pre>
      ) : (
        <div
          className={cn(
            "px-3 py-1.5 text-[12px] truncate",
            mono && "font-mono text-foreground/90",
          )}
          title={value}
        >
          {value}
        </div>
      )}
    </div>
  );
}
