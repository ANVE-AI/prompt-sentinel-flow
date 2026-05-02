import { Link } from "react-router-dom";

/**
 * AnveGuard mark — a rotated square with a single diagonal scanline.
 * Reads as "guard" + "inspect". Custom-drawn so it doesn't look like
 * the Lucide-Shield-in-a-gradient-square pattern shipped by every
 * scaffolded SaaS dashboard.
 *
 * Two strokes: outer outline + accent scanline. On hover the scanline
 * brightens. Sized via the `size` prop so it scales cleanly in the
 * topbar (24), sidebar (28), and landing hero (40).
 */
export const LogoMark = ({ size = 28, className = "" }: { size?: number; className?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden
  >
    <g transform="translate(16 16) rotate(45) translate(-10 -10)">
      <rect
        x="0.75" y="0.75"
        width="18.5" height="18.5"
        rx="3.25"
        stroke="hsl(var(--foreground))"
        strokeOpacity="0.85"
        strokeWidth="1.5"
      />
      {/* Inner notch — the "guard" tooth */}
      <rect
        x="6" y="6"
        width="8" height="8"
        rx="1"
        fill="hsl(var(--primary))"
      />
    </g>
    {/* Diagonal scanline traversing the mark */}
    <line
      x1="3" y1="22" x2="29" y2="10"
      stroke="hsl(var(--primary))"
      strokeWidth="1.5"
      strokeLinecap="round"
      className="opacity-90"
    />
  </svg>
);

export const Logo = ({
  to = "/",
  showWordmark = true,
  size = 26,
}: {
  to?: string;
  showWordmark?: boolean;
  size?: number;
}) => (
  <Link to={to} className="inline-flex items-center gap-2.5 group">
    <LogoMark size={size} className="transition-transform duration-300 group-hover:rotate-[15deg]" />
    {showWordmark && (
      <span className="font-semibold tracking-tight text-[15px] leading-none">
        anveguard
      </span>
    )}
  </Link>
);
