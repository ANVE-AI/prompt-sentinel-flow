import { Link } from "react-router-dom";
import { ArrowRight, Shield, Activity, KeyRound, FileSearch, Zap, Lock, Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";

const codeSample = `from openai import OpenAI

client = OpenAI(
    base_url="https://api.anveguard.dev/v1",  # ← drop-in
    api_key="ag_live_••••••••",                # ← AnveGuard key
)

resp = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Hello!"}],
)`;

const features = [
  { icon: Shield, title: "Policy guardrails", desc: "Block prompts and responses against keyword and regex policies before they reach your users." },
  { icon: Activity, title: "Full visibility", desc: "Every request, response, model and latency captured in one searchable log." },
  { icon: KeyRound, title: "Keys you control", desc: "Issue, scope and revoke AnveGuard keys per environment without touching provider credentials." },
  { icon: Zap, title: "Multi-provider", desc: "Route to OpenAI or Lovable AI — switch providers without changing your app." },
  { icon: FileSearch, title: "Audit-ready logs", desc: "Inspect prompts and responses with structured filters for compliance reviews." },
  { icon: Lock, title: "Zero code changes", desc: "Drop-in compatible with the OpenAI Chat Completions API. Change one URL. That's it." },
];

const Landing = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/70 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between">
          <Logo />
          <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#how" className="hover:text-foreground transition-colors">How it works</a>
            <a href="#docs" className="hover:text-foreground transition-colors">Docs</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild><Link to="/dashboard">Sign in</Link></Button>
            <Button asChild className="bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90">
              <Link to="/dashboard">Get started <ArrowRight className="ml-1 h-4 w-4" /></Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-[0.15]" />
        <div className="absolute inset-0 bg-hero" />
        <div className="container relative py-24 md:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-1 text-xs text-muted-foreground mb-6">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              AI Firewall for LLM Applications
            </div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.05]">
              The control layer between your app and{" "}
              <span className="text-gradient">every AI model</span>.
            </h1>
            <p className="mt-6 text-lg md:text-xl text-muted-foreground leading-relaxed">
              AnveGuard is a drop-in proxy for the OpenAI Chat Completions API. Enforce policies,
              capture every interaction, and govern AI usage from a single dashboard.
            </p>
            <div className="mt-8 flex items-center justify-center gap-3">
              <Button size="lg" asChild className="bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90 shadow-glow">
                <Link to="/dashboard">Start free <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <a href="#how">See how it works</a>
              </Button>
            </div>
          </div>

          {/* Code window */}
          <div className="mx-auto mt-16 max-w-3xl">
            <div className="rounded-xl border border-border bg-card/80 backdrop-blur shadow-elegant overflow-hidden">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <div className="flex gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
                  <div className="h-2.5 w-2.5 rounded-full bg-warning/70" />
                  <div className="h-2.5 w-2.5 rounded-full bg-success/70" />
                </div>
                <span className="ml-2 text-xs text-muted-foreground font-mono">main.py</span>
              </div>
              <pre className="px-5 py-4 text-sm font-mono leading-relaxed text-foreground/90 overflow-x-auto">
                <code>{codeSample}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="container py-24 border-t border-border/50">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Everything you need to govern AI usage</h2>
          <p className="mt-4 text-muted-foreground text-lg">Built for developers, ready for enterprise.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div key={f.title} className="group relative rounded-xl border border-border bg-card p-6 hover:border-primary/40 transition-colors">
              <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-base">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="container py-24 border-t border-border/50">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">How AnveGuard works</h2>
          <p className="mt-4 text-muted-foreground text-lg">A simple pipeline. Total control.</p>
        </div>
        <div className="mx-auto max-w-4xl">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-stretch">
            {[
              { t: "Your app", d: "Calls /v1/chat/completions" },
              { t: "Auth check", d: "AnveGuard API key" },
              { t: "Input policy", d: "Block or allow" },
              { t: "Provider", d: "OpenAI / Lovable AI" },
              { t: "Output + log", d: "Filter, log, return" },
            ].map((s, i) => (
              <div key={s.t} className="rounded-xl border border-border bg-card p-5 relative">
                <div className="text-xs text-primary font-mono mb-2">0{i + 1}</div>
                <div className="font-semibold">{s.t}</div>
                <div className="text-sm text-muted-foreground mt-1">{s.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container py-24 border-t border-border/50">
        <div className="rounded-2xl border border-border bg-gradient-to-br from-card to-card/40 p-12 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-hero opacity-60" />
          <div className="relative">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Ship safer AI today</h2>
            <p className="mt-4 text-muted-foreground text-lg max-w-xl mx-auto">
              Start free. Issue your first key in under a minute.
            </p>
            <Button size="lg" asChild className="mt-8 bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90 shadow-glow">
              <Link to="/dashboard">Open dashboard <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/50">
        <div className="container py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo />
          <p className="text-sm text-muted-foreground">© 2026 AnveGuard. The AI firewall.</p>
          <a href="#" className="text-muted-foreground hover:text-foreground"><Github className="h-4 w-4" /></a>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
