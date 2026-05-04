import { useState, type ReactNode } from "react";
import { ChevronDown, BookOpen, Copy, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type HelpStep = { title: string; body: ReactNode };
export type HelpExample = { label: string; language?: string; code: string };

/**
 * Collapsible "How it works" panel for a dashboard page.
 *
 * Renders three sections inside a single dismissible card:
 *   1. A numbered step-by-step usage guide
 *   2. Optional copyable code/curl examples
 *   3. Optional free-form `children` (FAQs, links, callouts)
 *
 * Persists the open/closed state per `storageKey` so users only collapse it
 * once. Keep the steps to ≤4 short bullets and examples self-contained.
 */
export function HelpPanel({
  title = "How it works",
  storageKey,
  steps,
  examples,
  children,
  defaultOpen = false,
}: {
  title?: string;
  storageKey: string;
  steps: HelpStep[];
  examples?: HelpExample[];
  children?: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return defaultOpen;
    const v = window.localStorage.getItem(`help:${storageKey}`);
    if (v === null) return defaultOpen;
    return v === "1";
  });

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(`help:${storageKey}`, next ? "1" : "0");
    } catch {
      /* localStorage unavailable — non-fatal */
    }
  };

  return (
    <Card className="surface-1 border-border">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors rounded-t-md"
      >
        <BookOpen className="h-4 w-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{title}</div>
          {!open && (
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {steps.length} step{steps.length === 1 ? "" : "s"}
              {examples?.length ? ` · ${examples.length} example${examples.length === 1 ? "" : "s"}` : ""}
            </div>
          )}
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-4 border-t border-border">
          <ol className="space-y-2.5 text-sm">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-medium">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="font-medium">{s.title}</div>
                  <div className="text-muted-foreground text-[13px] mt-0.5 leading-relaxed">{s.body}</div>
                </div>
              </li>
            ))}
          </ol>

          {examples && examples.length > 0 && (
            <div className="space-y-2">
              {examples.map((ex, i) => (
                <ExampleBlock key={i} example={ex} />
              ))}
            </div>
          )}

          {children}
        </div>
      )}
    </Card>
  );
}

function ExampleBlock({ example }: { example: HelpExample }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(example.code).then(
      () => {
        setCopied(true);
        toast.success(`${example.label} copied`);
        setTimeout(() => setCopied(false), 1500);
      },
      () => toast.error("Copy failed"),
    );
  };
  return (
    <div className="rounded-md border border-border bg-muted/20">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/60">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          {example.label}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleCopy}
          className="h-6 px-2 text-xs"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="px-3 py-2 text-[11px] font-mono leading-relaxed overflow-x-auto whitespace-pre">
        {example.code}
      </pre>
    </div>
  );
}
