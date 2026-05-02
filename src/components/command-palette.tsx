import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useClerk } from "@clerk/clerk-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  KeyRound,
  Plug,
  ShieldCheck,
  ScrollText,
  Terminal,
  Plus,
  Sun,
  Moon,
  LogOut,
} from "lucide-react";

/**
 * Global ⌘K palette mounted once in DashboardLayout.
 *
 * Commands:
 *  - Navigate (six dashboard pages)
 *  - Quick create (key, endpoint — uses ?new=1 query that the page reads)
 *  - Toggle theme  (writes/removes `light` class on <html>)
 *  - Sign out      (Clerk)
 *
 * Trigger: ⌘K / Ctrl+K, or click on the topbar `⌘K` chip (which dispatches
 * the same custom event so the chip stays a passive hint, not a button
 * with its own state).
 */
export const COMMAND_PALETTE_EVENT = "anveguard:open-command-palette";

export const CommandPalette = () => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { signOut } = useClerk();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onEvent = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(COMMAND_PALETTE_EVENT, onEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(COMMAND_PALETTE_EVENT, onEvent);
    };
  }, []);

  const go = (to: string) => () => {
    setOpen(false);
    navigate(to);
  };

  const toggleTheme = () => {
    document.documentElement.classList.toggle("light");
    setOpen(false);
  };

  const isLight =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("light");

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command, or search…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>

        <CommandGroup heading="Navigate">
          <CommandItem onSelect={go("/dashboard")}><LayoutDashboard className="mr-2 h-4 w-4" />Overview</CommandItem>
          <CommandItem onSelect={go("/dashboard/keys")}><KeyRound className="mr-2 h-4 w-4" />API Keys</CommandItem>
          <CommandItem onSelect={go("/dashboard/endpoints")}><Plug className="mr-2 h-4 w-4" />Endpoints</CommandItem>
          <CommandItem onSelect={go("/dashboard/policies")}><ShieldCheck className="mr-2 h-4 w-4" />Policies</CommandItem>
          <CommandItem onSelect={go("/dashboard/logs")}><ScrollText className="mr-2 h-4 w-4" />Logs</CommandItem>
          <CommandItem onSelect={go("/dashboard/playground")}><Terminal className="mr-2 h-4 w-4" />Playground</CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Create">
          <CommandItem onSelect={go("/dashboard/keys?new=1")}><Plus className="mr-2 h-4 w-4" />New API key</CommandItem>
          <CommandItem onSelect={go("/dashboard/endpoints?new=1")}><Plus className="mr-2 h-4 w-4" />New endpoint</CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Settings">
          <CommandItem onSelect={toggleTheme}>
            {isLight ? <Moon className="mr-2 h-4 w-4" /> : <Sun className="mr-2 h-4 w-4" />}
            Toggle theme
          </CommandItem>
          <CommandItem onSelect={() => { setOpen(false); signOut({ redirectUrl: "/" }); }}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};
