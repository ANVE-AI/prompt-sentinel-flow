import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Code snippet tabs (Python / Node / curl) for the landing page.
 * Flat surface card, no fake macOS chrome. Copy-to-clipboard with
 * inline confirmation — toast is intentionally not used here because
 * landing should not depend on the toaster context.
 */
const samples: Record<string, { lang: string; code: string }> = {
  python: {
    lang: "python",
    code: `from openai import OpenAI

client = OpenAI(
    base_url="https://api.anveguard.dev/v1",  # ← drop-in
    api_key="ag_live_••••••••",                # ← AnveGuard key
)

resp = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Hello!"}],
)`,
  },
  node: {
    lang: "javascript",
    code: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.anveguard.dev/v1",
  apiKey: process.env.ANVEGUARD_KEY,
});

const resp = await client.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "Hello!" }],
});`,
  },
  curl: {
    lang: "bash",
    code: `curl https://api.anveguard.dev/v1/chat/completions \\
  -H "Authorization: Bearer $ANVEGUARD_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role":"user","content":"Hello!"}]
  }'`,
  },
};

export const CodeTabs = () => {
  const tabs = Object.keys(samples);
  const [active, setActive] = useState(tabs[0]);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(samples[active].code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="rounded-xl border border-border surface-1 overflow-hidden shadow-pop">
      <div className="flex items-center justify-between border-b border-border pl-2 pr-2">
        <div className="flex">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setActive(t)}
              className={cn(
                "px-3 h-10 text-meta font-mono uppercase tracking-wider transition-colors relative",
                active === t
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t}
              {active === t && (
                <span className="absolute left-2 right-2 -bottom-px h-px bg-primary" />
              )}
            </button>
          ))}
        </div>
        <button
          onClick={copy}
          className="inline-flex items-center gap-1.5 text-meta text-muted-foreground hover:text-foreground transition-colors h-7 px-2 rounded-md hover:bg-surface-2"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-status-ok" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="p-5 text-[12.5px] leading-[1.6] font-mono overflow-x-auto bg-[hsl(var(--surface-1))]">
        <code>{samples[active].code}</code>
      </pre>
    </div>
  );
};
