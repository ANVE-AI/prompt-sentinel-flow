/**
 * PipelineDiagram — small SVG showing
 *   your-app → ▢ AnveGuard → ▢ provider
 * with a single packet that animates along the wire. The motif matches
 * the scanline rail used in the dashboard, so the brand reads consistently
 * from landing to product.
 *
 * Pure SVG, no JS animation — uses SMIL <animate> which respects
 * prefers-reduced-motion through the browser's own throttling rules.
 */
export const PipelineDiagram = ({ className = "" }: { className?: string }) => (
  <svg
    viewBox="0 0 480 240"
    className={className}
    role="img"
    aria-label="Request pipeline: your application sends a request through AnveGuard to an AI provider."
  >
    {/* Faint background grid */}
    <defs>
      <pattern id="pgrid" width="24" height="24" patternUnits="userSpaceOnUse">
        <path d="M24 0H0V24" fill="none" stroke="hsl(var(--border))" strokeOpacity=".5" strokeWidth="1" />
      </pattern>
      <linearGradient id="wire" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0" />
        <stop offset="50%" stopColor="hsl(var(--primary))" stopOpacity="1" />
        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
      </linearGradient>
      <mask id="fade">
        <rect width="480" height="240" fill="url(#fadeg)" />
        <radialGradient id="fadeg" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="white" />
          <stop offset="100%" stopColor="black" />
        </radialGradient>
      </mask>
    </defs>
    <rect width="480" height="240" fill="url(#pgrid)" opacity=".6" />

    {/* Wires */}
    <line x1="76" y1="120" x2="200" y2="120" stroke="hsl(var(--border-strong))" strokeWidth="1.25" />
    <line x1="280" y1="120" x2="404" y2="120" stroke="hsl(var(--border-strong))" strokeWidth="1.25" />

    {/* Travelling packet */}
    <circle r="3.5" fill="hsl(var(--primary))">
      <animateMotion dur="3.2s" repeatCount="indefinite"
        path="M76 120 L200 120" />
    </circle>
    <circle r="3.5" fill="hsl(var(--primary))">
      <animateMotion dur="3.2s" begin="1.6s" repeatCount="indefinite"
        path="M280 120 L404 120" />
    </circle>

    {/* Left node — your app */}
    <g>
      <rect x="16" y="92" width="60" height="56" rx="8"
        fill="hsl(var(--surface-2))" stroke="hsl(var(--border-strong))" />
      <text x="46" y="124" textAnchor="middle"
        fontSize="11" fontFamily="var(--font-mono)"
        fill="hsl(var(--muted-foreground))">your-app</text>
    </g>

    {/* Center node — AnveGuard */}
    <g>
      <rect x="200" y="84" width="80" height="72" rx="10"
        fill="hsl(var(--surface-1))" stroke="hsl(var(--primary))" strokeOpacity=".55" />
      <g transform="translate(240 120) rotate(45) translate(-9 -9)">
        <rect width="18" height="18" rx="3" fill="none"
          stroke="hsl(var(--foreground))" strokeOpacity=".85" strokeWidth="1.3" />
        <rect x="6" y="6" width="6" height="6" rx="1" fill="hsl(var(--primary))" />
      </g>
      <text x="240" y="148" textAnchor="middle"
        fontSize="10.5" fontFamily="var(--font-mono)"
        fill="hsl(var(--foreground))">anveguard</text>
    </g>

    {/* Right node — provider */}
    <g>
      <rect x="404" y="92" width="60" height="56" rx="8"
        fill="hsl(var(--surface-2))" stroke="hsl(var(--border-strong))" />
      <text x="434" y="124" textAnchor="middle"
        fontSize="11" fontFamily="var(--font-mono)"
        fill="hsl(var(--muted-foreground))">provider</text>
    </g>

    {/* Status badges hovering above the center */}
    <g transform="translate(200 60)">
      <rect width="80" height="18" rx="9" fill="hsl(var(--surface-2))" stroke="hsl(var(--border))" />
      <circle cx="10" cy="9" r="3" fill="hsl(var(--status-ok))" />
      <text x="20" y="12.5" fontSize="9.5" fontFamily="var(--font-mono)"
        fill="hsl(var(--muted-foreground))">policy: pass</text>
    </g>
  </svg>
);
