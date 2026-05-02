import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, useClerk } from "@clerk/clerk-react";
import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useDashboardApi } from "@/lib/api";
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
  Activity,
  Hash,
} from "lucide-react";

/**
 * Global ⌘K palette mounted once in DashboardLayout.
 *
 * In addition to navigation/quick-create/theme/sign-out, this palette is the
 * project's global search: when opened it lazily fetches keys, endpoints,
 * recent logs, and policy keywords for the signed-in user and surfaces them
 * as filterable result groups. Typing narrows everything in-place; selecting
 * a result deep-links into the relevant page (logs are linked by id via the
 * `?focus=` query string that Logs.tsx reads to auto-open the detail sheet).
 */
export const COMMAND_PALETTE_EVENT = "anveguard:open-command-palette";

type KeyRow = { id: string; name: string; key_prefix?: string; provider?: string; is_active?: boolean };
type EndpointRow = { id: string; name: string; base_url?: string; kind?: string };
type LogRow = {
  id: string;
  provider?: string;
  model?: string | null;
  status: string;
  api_key_name?: string;
  created_at: string;
};
type PolicyRow = { allowed_keywords?: string[]; blocked_keywords?: string[] };

export const CommandPalette = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { signOut } = useClerk();
  const { isSignedIn } = useAuth();
  const { call } = useDashboardApi();

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

  // Reset the input each time the palette closes so the next open is clean.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // Lazy: only fetch search corpora once the palette has been opened and the
  // user is signed in. React Query caches across opens so subsequent ⌘K is
  // instant.
  const enabled = open && !!isSignedIn;
  const keysQ = useQuery<{ keys: KeyRow[] }>({
    queryKey: ["search", "keys"],
    queryFn: () => call("list_keys"),
    enabled,
    staleTime: 30_000,
  });
  const endpointsQ = useQuery<{ endpoints: EndpointRow[] }>({
    queryKey: ["search", "endpoints"],
    queryFn: () => call("list_endpoints"),
    enabled,
    staleTime: 30_000,
  });
  const logsQ = useQuery<{ logs: LogRow[] }>({
    queryKey: ["search", "logs"],
    queryFn: () => call("list_logs", { query: { limit: "100" } }),
    enabled,
    staleTime: 15_000,
  });
  const policyQ = useQuery<{ policy: PolicyRow }>({
    queryKey: ["search", "policy"],
    queryFn: () => call("get_policy"),
    enabled,
    staleTime: 60_000,
  });

  const q = query.trim().toLowerCase();
  const matches = (s: string | undefined | null) => !!s && s.toLowerCase().includes(q);

  const keys = useMemo(() => {
    const all = keysQ.data?.keys ?? [];
    if (!q) return all.slice(0, 5);
    return all
      .filter((k) => matches(k.name) || matches(k.key_prefix) || matches(k.provider))
      .slice(0, 8);
  }, [keysQ.data, q]);

  const endpoints = useMemo(() => {
    const all = endpointsQ.data?.endpoints ?? [];
    if (!q) return all.slice(0, 5);
    return all
      .filter((e) => matches(e.name) || matches(e.base_url) || matches(e.kind))
      .slice(0, 8);
  }, [endpointsQ.data, q]);

  const logs = useMemo(() => {
    const all = logsQ.data?.logs ?? [];
    if (!q) return all.slice(0, 5);
    return all
      .filter(
        (l) =>
          matches(l.id) ||
          matches(l.model ?? "") ||
          matches(l.provider ?? "") ||
          matches(l.status) ||
          matches(l.api_key_name ?? ""),
      )
      .slice(0, 8);
  }, [logsQ.data, q]);

  const keywords = useMemo(() => {
    const p = policyQ.data?.policy;
    if (!p) return [] as { word: string; kind: "allowed" | "blocked" }[];
    const list: { word: string; kind: "allowed" | "blocked" }[] = [
      ...(p.allowed_keywords ?? []).map((w) => ({ word: w, kind: "allowed" as const })),
      ...(p.blocked_keywords ?? []).map((w) => ({ word: w, kind: "blocked" as const })),
    ];
    if (!q) return [];
    return list.filter((k) => matches(k.word)).slice(0, 8);
  }, [policyQ.data, q]);

  const close = () => setOpen(false);
  const go = (to: string) => () => {
    close();
    navigate(to);
  };

  const toggleTheme = () => {
    document.documentElement.classList.toggle("light");
    close();
  };

  const isLight =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("light");

  // When the user is searching, hide the static command groups so results
  // dominate the surface. With an empty query we keep the original palette.
  const searching = q.length > 0;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search keys, endpoints, logs, policies — or type a command…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>

        {keys.length > 0 && (
          <CommandGroup heading="API keys">
            {keys.map((k) => (
              <CommandItem
                key={k.id}
                value={`key ${k.name} ${k.key_prefix ?? ""} ${k.provider ?? ""}`}
                onSelect={go(`/dashboard/keys?focus=${k.id}`)}
              >
                <KeyRound className="mr-2 h-4 w-4" />
                <span className="truncate">{k.name}</span>
                {k.key_prefix && (
                  <span className="ml-2 font-mono text-xs text-muted-foreground">
                    {k.key_prefix}…
                  </span>
                )}
                {k.is_active === false && (
                  <span className="ml-auto text-xs text-muted-foreground">revoked</span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {endpoints.length > 0 && (
          <CommandGroup heading="Endpoints">
            {endpoints.map((e) => (
              <CommandItem
                key={e.id}
                value={`endpoint ${e.name} ${e.base_url ?? ""} ${e.kind ?? ""}`}
                onSelect={go(`/dashboard/endpoints?focus=${e.id}`)}
              >
                <Plug className="mr-2 h-4 w-4" />
                <span className="truncate">{e.name}</span>
                {e.base_url && (
                  <span className="ml-2 truncate text-xs text-muted-foreground">
                    {e.base_url}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {logs.length > 0 && (
          <CommandGroup heading="Recent requests">
            {logs.map((l) => (
              <CommandItem
                key={l.id}
                value={`log ${l.id} ${l.model ?? ""} ${l.provider ?? ""} ${l.status} ${l.api_key_name ?? ""}`}
                onSelect={go(`/dashboard/logs?focus=${l.id}`)}
              >
                <Activity className="mr-2 h-4 w-4" />
                <span className="truncate">
                  {l.model ?? l.provider ?? "request"}
                </span>
                <span className="ml-2 text-xs text-muted-foreground">{l.status}</span>
                <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                  {l.id.slice(0, 8)}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {keywords.length > 0 && (
          <CommandGroup heading="Policy keywords">
            {keywords.map((k) => (
              <CommandItem
                key={`${k.kind}:${k.word}`}
                value={`policy ${k.kind} ${k.word}`}
                onSelect={go("/dashboard/policies")}
              >
                <Hash className="mr-2 h-4 w-4" />
                <span className="truncate">{k.word}</span>
                <span className="ml-auto text-xs text-muted-foreground">{k.kind}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {(keys.length > 0 || endpoints.length > 0 || logs.length > 0 || keywords.length > 0) && (
          <CommandSeparator />
        )}

        {!searching && (
          <>
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
          </>
        )}

        <CommandGroup heading="Settings">
          <CommandItem onSelect={toggleTheme}>
            {isLight ? <Moon className="mr-2 h-4 w-4" /> : <Sun className="mr-2 h-4 w-4" />}
            Toggle theme
          </CommandItem>
          <CommandItem onSelect={() => { close(); signOut({ redirectUrl: "/" }); }}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};
