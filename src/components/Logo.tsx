import { Shield } from "lucide-react";
import { Link } from "react-router-dom";

export const Logo = ({ to = "/" }: { to?: string }) => (
  <Link to={to} className="flex items-center gap-2 group">
    <div className="relative">
      <div className="absolute inset-0 bg-primary/40 blur-md rounded-full group-hover:bg-primary/60 transition-colors" />
      <div className="relative h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
        <Shield className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
      </div>
    </div>
    <span className="font-semibold tracking-tight text-lg">
      Anve<span className="text-gradient">Guard</span>
    </span>
  </Link>
);
