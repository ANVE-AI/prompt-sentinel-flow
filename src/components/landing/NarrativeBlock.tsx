import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Three-up narrative section on the landing page. Each block alternates
 * sides on lg+ to create rhythm. Visual is a small inline SVG mock of a
 * dashboard surface — keeps the page self-contained without bitmap assets.
 */
export const NarrativeBlock = ({
  eyebrow,
  title,
  body,
  visual,
  reverse,
}: {
  eyebrow: string;
  title: ReactNode;
  body: ReactNode;
  visual: ReactNode;
  reverse?: boolean;
}) => (
  <div
    className={cn(
      "grid lg:grid-cols-2 gap-10 lg:gap-16 items-center py-16 border-t border-border",
      reverse && "lg:[&>*:first-child]:order-2"
    )}
  >
    <div>
      <div className="text-[11px] uppercase tracking-[0.18em] text-primary font-mono mb-3">
        {eyebrow}
      </div>
      <h2 className="text-display font-semibold tracking-tight">{title}</h2>
      <p className="mt-4 text-body text-muted-foreground max-w-md leading-relaxed">{body}</p>
    </div>
    <div className="rounded-xl border border-border surface-1 shadow-pop overflow-hidden">
      {visual}
    </div>
  </div>
);

// --- Inline SVG visuals (kept tiny / token-driven) -------------------------

export const InspectVisual = () => (
  <svg viewBox="0 0 520 280" className="w-full h-auto block">
    <rect width="520" height="280" fill="hsl(var(--surface-1))" />
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <g key={i} transform={`translate(0 ${30 + i * 36})`}>
        <line x1="0" x2="520" y1="0" y2="0" stroke="hsl(var(--border))" />
        <text x="20" y="22" fontSize="11" fontFamily="var(--font-mono)" fill="hsl(var(--muted-foreground))">
          14:0{i}:21
        </text>
        <text x="100" y="22" fontSize="11.5" fontFamily="var(--font-sans)" fill="hsl(var(--foreground))">
          {["What is the capital of France?",
            "Summarize this paragraph",
            "Translate to Spanish",
            "Generate test cases",
            "List blocked terms",
            "Refactor this function"][i]}
        </text>
        <rect x="380" y="8" width="58" height="18" rx="4" fill="hsl(var(--surface-2))" stroke="hsl(var(--border-strong))" />
        <circle cx="392" cy="17" r="3" fill={i === 4 ? "hsl(var(--status-block))" : "hsl(var(--status-ok))"} />
        <text x="402" y="20.5" fontSize="10" fontFamily="var(--font-mono)" fill="hsl(var(--muted-foreground))">
          {i === 4 ? "blocked" : "allowed"}
        </text>
        <text x="450" y="22" fontSize="11" fontFamily="var(--font-mono)" fill="hsl(var(--muted-foreground))">
          {120 + i * 13}ms
        </text>
      </g>
    ))}
  </svg>
);

export const EnforceVisual = () => (
  <svg viewBox="0 0 520 280" className="w-full h-auto block">
    <rect width="520" height="280" fill="hsl(var(--surface-1))" />
    <text x="20" y="36" fontSize="11" fontFamily="var(--font-mono)" fill="hsl(var(--muted-foreground))">
      blocked_keywords
    </text>
    {["password", "ssn", "internal-only", "credentials", "api_key"].map((kw, i) => (
      <g key={kw} transform={`translate(${20 + (i % 3) * 130} ${56 + Math.floor(i / 3) * 40})`}>
        <rect width="118" height="28" rx="6" fill="hsl(var(--surface-2))" stroke="hsl(var(--border-strong))" />
        <text x="14" y="18" fontSize="11.5" fontFamily="var(--font-mono)" fill="hsl(var(--foreground))">{kw}</text>
        <text x="100" y="18" fontSize="11" fontFamily="var(--font-mono)" fill="hsl(var(--muted-foreground))">×</text>
      </g>
    ))}
    <text x="20" y="184" fontSize="11" fontFamily="var(--font-mono)" fill="hsl(var(--muted-foreground))">
      block_message
    </text>
    <rect x="20" y="196" width="480" height="56" rx="8" fill="hsl(var(--surface-2))" stroke="hsl(var(--border-strong))" />
    <text x="32" y="220" fontSize="12" fontFamily="var(--font-sans)" fill="hsl(var(--foreground))">
      This request was blocked by your organization's AI policy.
    </text>
    <text x="32" y="240" fontSize="11" fontFamily="var(--font-mono)" fill="hsl(var(--status-block))">
      ⛔ matched: "credentials"
    </text>
  </svg>
);

export const AuditVisual = () => (
  <svg viewBox="0 0 520 280" className="w-full h-auto block">
    <rect width="520" height="280" fill="hsl(var(--surface-1))" />
    {[
      { who: "founders@…",   action: "api_key.created",  ts: "2 min" },
      { who: "founders@…",   action: "policy.updated",   ts: "1 hr"  },
      { who: "alex@…",        action: "endpoint.tested",  ts: "3 hr"  },
      { who: "system",        action: "key.revoked",       ts: "1 d"   },
      { who: "alex@…",        action: "key.created",       ts: "2 d"   },
    ].map((row, i) => (
      <g key={i} transform={`translate(0 ${30 + i * 40})`}>
        <line x1="0" x2="520" y1="0" y2="0" stroke="hsl(var(--border))" />
        <text x="20" y="24" fontSize="11" fontFamily="var(--font-mono)" fill="hsl(var(--muted-foreground))">{row.ts}</text>
        <text x="80" y="24" fontSize="11.5" fontFamily="var(--font-mono)" fill="hsl(var(--foreground))">{row.who}</text>
        <text x="220" y="24" fontSize="11.5" fontFamily="var(--font-mono)" fill="hsl(var(--primary))">{row.action}</text>
      </g>
    ))}
  </svg>
);
