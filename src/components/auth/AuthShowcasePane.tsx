import { ShieldCheck, Plug, KeyRound, Sparkles } from "lucide-react";

/**
 * Showcase pane shown beside the Clerk auth form on /sign-in and /sign-up.
 *
 * Static — no API calls, so it renders happily before the user is signed in.
 * Mocks the same "recent requests" row format used in the dashboard so the
 * landing → auth → dashboard transition feels continuous.
 */
const rows = [
  { time: "14:02", prompt: "Translate to Spanish: hello world", key: "prod-key", status: "ok" as const, ms: 142 },
  { time: "14:01", prompt: "Summarize meeting transcript",       key: "prod-key", status: "ok" as const, ms: 268 },
  { time: "13:59", prompt: "Share api_key=sk-•••••",             key: "demo-key", status: "block" as const, ms: 6 },
  { time: "13:58", prompt: "Generate test cases for login",      key: "ci-key",   status: "ok" as const, ms: 412 },
  { time: "13:55", prompt: "Refactor this React component",      key: "prod-key", status: "ok" as const, ms: 318 },
  { time: "13:54", prompt: "Reveal internal-only roadmap",       key: "demo-key", status: "block" as const, ms: 4 },
];

const dot = {
  ok: "bg-status-ok",
  block: "bg-status-block",
};

export const AuthShowcasePane = () => (
  <div className="hidden lg:flex flex-col w-full h-full surface-1 border-l border-border relative overflow-hidden">
    <div className="absolute inset-0 bg-grid-fade pointer-events-none opacity-60" />
    <div className="relative p-10 flex-1 flex flex-col">
      <div className="inline-flex items-center gap-2 rounded-full border border-border surface-2 px-3 py-1 text-meta text-muted-foreground w-fit">
        <ShieldCheck className="h-3 w-3 text-primary" />
        Live in production
      </div>
      <h2 className="mt-6 text-display font-semibold tracking-tight max-w-md">
        Every request, inspected — before it leaves your network.
      </h2>
      <p className="mt-3 text-body text-muted-foreground max-w-md">
        Sign in to see your live request stream, manage keys, and tune
        policies from one operator console.
      </p>

      {/* Mock log surface */}
      <div className="mt-10 rounded-xl border border-border surface-1 shadow-pop overflow-hidden scanline">
        <div className="grid grid-cols-[60px_1fr_90px_60px_50px] items-center gap-3 px-4 h-9 border-b border-border text-meta uppercase tracking-wider text-muted-foreground font-mono">
          <span>Time</span>
          <span>Prompt</span>
          <span>Key</span>
          <span>Status</span>
          <span className="text-right">Lat</span>
        </div>
        <ul>
          {rows.map((r, i) => (
            <li
              key={i}
              className="grid grid-cols-[60px_1fr_90px_60px_50px] items-center gap-3 px-4 h-9 border-b border-border last:border-b-0 hover:bg-surface-2 transition-colors"
            >
              <span className="text-meta font-mono text-muted-foreground">{r.time}</span>
              <span className="truncate text-body">{r.prompt}</span>
              <span className="text-meta font-mono text-muted-foreground truncate">{r.key}</span>
              <span className="inline-flex items-center gap-1.5 text-meta">
                <span className={`h-1.5 w-1.5 rounded-full ${dot[r.status]}`} />
                {r.status === "ok" ? "allowed" : "blocked"}
              </span>
              <span className="text-meta font-mono text-muted-foreground text-right tabular-nums">{r.ms}ms</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Compact 3-step quickstart — gives new users a clear destination
          immediately after they sign in. Steps mirror the landing page so the
          flow stays consistent across surfaces. */}
      <div className="mt-8">
        <div className="text-meta uppercase tracking-[0.18em] text-muted-foreground font-mono">
          After you sign in
        </div>
        <ol className="mt-3 space-y-2.5">
          {[
            { icon: Plug, title: "Create an endpoint", body: "Add the upstream provider to guard." },
            { icon: KeyRound, title: "Generate a key", body: "Bind an ag_live_… key to that endpoint." },
            { icon: Sparkles, title: "Test in Playground", body: "Send a real prompt and watch verdicts live." },
          ].map((s, i) => {
            const Icon = s.icon;
            return (
              <li key={i} className="flex items-start gap-3">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-primary/10 text-primary shrink-0">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <div className="text-body font-medium leading-tight">
                    <span className="font-mono text-muted-foreground mr-2">0{i + 1}</span>
                    {s.title}
                  </div>
                  <div className="text-meta text-muted-foreground mt-0.5">{s.body}</div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  </div>
);
