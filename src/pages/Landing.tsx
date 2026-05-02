import { Link } from "react-router-dom";
import { ArrowRight, Github, Activity, ShieldCheck, FileSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { PipelineDiagram } from "@/components/landing/PipelineDiagram";
import { CodeTabs } from "@/components/landing/CodeTabs";
import {
  NarrativeBlock,
  InspectVisual,
  EnforceVisual,
  AuditVisual,
} from "@/components/landing/NarrativeBlock";

const Landing = () => (
  <div className="min-h-screen bg-background text-foreground">
    {/* --------------------------------- Nav --------------------------------- */}
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="container flex h-14 items-center justify-between">
        <Logo />
        <nav className="hidden md:flex items-center gap-8 text-body text-muted-foreground">
          <a href="#product" className="hover:text-foreground transition-colors">Product</a>
          <a href="#how" className="hover:text-foreground transition-colors">How it works</a>
          <a href="#docs" className="hover:text-foreground transition-colors">Docs</a>
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/sign-in">Sign in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link to="/sign-up">Get started <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
          </Button>
        </div>
      </div>
    </header>

    {/* --------------------------------- Hero -------------------------------- */}
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-grid-fade pointer-events-none" />
      <div className="container relative py-20 lg:py-28 grid lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-16 items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border surface-2 px-3 py-1 text-meta text-muted-foreground mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-status-ok live-pulse" />
            AI Firewall · Drop-in for OpenAI
          </div>
          <h1 className="text-display lg:text-display-xl font-semibold tracking-tight leading-[1.05]">
            The control layer between your app and every AI model.
          </h1>
          <p className="mt-5 text-body lg:text-base text-muted-foreground max-w-xl leading-relaxed">
            AnveGuard is a drop-in proxy for the OpenAI Chat Completions API.
            Inspect every request, enforce policies before they reach a provider,
            and audit usage from a single console.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button size="lg" asChild>
              <Link to="/sign-up">Start free <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="#how">See how it works</a>
            </Button>
          </div>
          <div className="mt-10 flex items-center gap-6 text-meta text-muted-foreground font-mono">
            <span>OPENAI</span>
            <span>·</span>
            <span>ANTHROPIC</span>
            <span>·</span>
            <span>LOVABLE AI</span>
            <span>·</span>
            <span>OPENAI-COMPATIBLE</span>
          </div>
        </div>
        <div className="relative">
          <div className="rounded-xl border border-border surface-1 shadow-pop p-6 scanline">
            <PipelineDiagram className="w-full h-auto" />
          </div>
        </div>
      </div>
    </section>

    {/* --------------------------- Snippet -------------------------- */}
    <section className="container pb-12 lg:pb-20">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-6">
          <div className="text-meta uppercase tracking-[0.18em] text-muted-foreground font-mono">
            Change one URL
          </div>
          <h2 className="text-h1 font-medium mt-2">No SDK. No code rewrites.</h2>
        </div>
        <CodeTabs />
      </div>
    </section>

    {/* ----------------------- Three narrative blocks ----------------------- */}
    <section id="product" className="container">
      <NarrativeBlock
        eyebrow="01 · Inspect"
        title="Every prompt, response, and model — in one searchable log."
        body="Latency, status, model, and key for every request. Filter by status, search by content, and open the full payload in a side sheet."
        visual={<InspectVisual />}
      />
      <NarrativeBlock
        reverse
        eyebrow="02 · Enforce"
        title="Policy guardrails that run before the request leaves your network."
        body="Keyword and regex policies block sensitive prompts and responses with a custom message. Apply globally or per key — change them without redeploying."
        visual={<EnforceVisual />}
      />
      <NarrativeBlock
        eyebrow="03 · Audit"
        title="A complete audit log of everything that changed."
        body="Key creation, revocation, policy updates, endpoint changes — captured with actor, timestamp, and metadata. Compliance-ready out of the box."
        visual={<AuditVisual />}
      />
    </section>

    {/* ---------------------------- How it works ---------------------------- */}
    <section id="how" className="container py-20 border-t border-border">
      <div className="max-w-2xl">
        <div className="text-meta uppercase tracking-[0.18em] text-primary font-mono">How it works</div>
        <h2 className="text-display font-semibold tracking-tight mt-2">
          Three steps. No infrastructure to manage.
        </h2>
      </div>
      <div className="mt-10 grid md:grid-cols-3 gap-px bg-border rounded-xl border border-border overflow-hidden">
        {[
          { n: "01", icon: ShieldCheck, t: "Issue a key", d: "Create an AnveGuard key in the dashboard. Scope it to an environment or model." },
          { n: "02", icon: Activity,    t: "Swap the URL",  d: "Point your OpenAI client base URL at AnveGuard. Use the AnveGuard key — no provider key in your app." },
          { n: "03", icon: FileSearch,  t: "Watch & govern", d: "Logs stream live. Policies enforce automatically. Revoke and rotate without touching code." },
        ].map((s) => (
          <div key={s.n} className="surface-1 p-6">
            <div className="flex items-center gap-2 text-meta font-mono text-muted-foreground mb-4">
              <s.icon className="h-3.5 w-3.5 text-primary" />
              {s.n}
            </div>
            <div className="text-h2 font-medium">{s.t}</div>
            <p className="mt-2 text-body text-muted-foreground leading-relaxed">{s.d}</p>
          </div>
        ))}
      </div>
    </section>

    {/* -------------------------------- CTA --------------------------------- */}
    <section id="docs" className="container py-20">
      <div className="rounded-xl border border-border surface-1 p-10 lg:p-14 text-center scanline relative overflow-hidden">
        <h2 className="text-display font-semibold tracking-tight">
          Ship AI features with a control layer from day one.
        </h2>
        <p className="mt-3 text-body text-muted-foreground max-w-lg mx-auto">
          Free to start. Pay only when you scale beyond the free tier.
        </p>
        <div className="mt-7 flex items-center justify-center gap-3">
          <Button size="lg" asChild>
            <Link to="/sign-up">Create your first key <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href="https://github.com" target="_blank" rel="noreferrer">
              <Github className="mr-2 h-4 w-4" /> GitHub
            </a>
          </Button>
        </div>
      </div>
    </section>

    {/* ------------------------------- Footer ------------------------------- */}
    <footer className="border-t border-border">
      <div className="container h-14 flex items-center justify-between text-meta text-muted-foreground">
        <div className="flex items-center gap-3">
          <Logo size={20} />
          <span>© {new Date().getFullYear()} AnveGuard</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-status-ok live-pulse" />
          All systems operational
        </div>
      </div>
    </footer>
  </div>
);

export default Landing;
