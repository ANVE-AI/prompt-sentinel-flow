import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, useClerk } from "@clerk/clerk-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
  FlaskConical,
  ScrollText,
  Terminal,
  Plus,
  Sun,
  Moon,
  LogOut,
  Activity,
  Hash,
  Copy,
  PlayCircle,
  Ban,
  Eye,
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
  const qc = useQueryClient();

  // ---- Quick actions on result rows -------------------------------------
  // Stops Cmdk's row-select from firing the row's default deep-link when the
  // user clicks an inline action button.
  const stop = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not access clipboard");
    }
  };

  const testKeyMutation = useMutation({
    mutationFn: (id: string) =>
      call<{ success: boolean; error?: string; latency_ms?: number }>(
        "test_api_key",
        { body: { api_key_id: id } },
      ),
    onSuccess: (res) => {
      if (res.success) toast.success(`Key OK · ${res.latency_ms ?? "—"}ms`);
      else toast.error(res.error ?? "Key test failed");
    },
    onError: (e: any) => toast.error(e?.message ?? "Key test failed"),
  });

  const revokeKeyMutation = useMutation({
    mutationFn: (id: string) => call("revoke_key", { body: { id } }),
    onSuccess: () => {
      toast.success("Key revoked");
      qc.invalidateQueries({ queryKey: ["keys"] });
      qc.invalidateQueries({ queryKey: ["search", "keys"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to revoke"),
  });

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

  // Compact icon button for inline row actions. Uses mousedown so the click
  // fires before Cmdk's keyboard/select handlers, and stops propagation so
  // the row's `onSelect` deep-link doesn't also run.
  const RowAction = ({
    icon,
    label,
    onRun,
    tone = "default",
  }: {
    icon: ReactNode;
    label: string;
    onRun: () => void;
    tone?: "default" | "danger";
  }) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={stop}
      onClick={(e) => {
        stop(e);
        onRun();
      }}
      className={`inline-flex h-6 w-6 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-surface-2 hover:text-foreground ${
        tone === "danger" ? "hover:text-destructive" : ""
      }`}
    >
      {icon}
    </button>
  );

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
                  <span className="ml-2 text-xs text-muted-foreground">revoked</span>
                )}
                <div className="ml-auto flex items-center gap-1">
                  {k.key_prefix && (
                    <RowAction
                      icon={<Copy className="h-3.5 w-3.5" />}
                      label="Copy key prefix"
                      onRun={() => copy(k.key_prefix!, "Prefix")}
                    />
                  )}
                  {k.is_active !== false && (
                    <>
                      <RowAction
                        icon={<PlayCircle className="h-3.5 w-3.5" />}
                        label="Test key"
                        onRun={() => testKeyMutation.mutate(k.id)}
                      />
                      <RowAction
                        tone="danger"
                        icon={<Ban className="h-3.5 w-3.5" />}
                        label="Revoke key"
                        onRun={() => {
                          if (window.confirm(`Revoke "${k.name}"? This cannot be undone.`)) {
                            revokeKeyMutation.mutate(k.id);
                          }
                        }}
                      />
                    </>
                  )}
                </div>
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
                <div className="ml-auto flex items-center gap-1">
                  {e.base_url && (
                    <RowAction
                      icon={<Copy className="h-3.5 w-3.5" />}
                      label="Copy base URL"
                      onRun={() => copy(e.base_url!, "Base URL")}
                    />
                  )}
                  <RowAction
                    icon={<Plus className="h-3.5 w-3.5" />}
                    label="New key for this endpoint"
                    onRun={() => {
                      close();
                      navigate(`/dashboard/keys?new=1&endpoint=${e.id}`);
                    }}
                  />
                </div>
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
                <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                  {l.id.slice(0, 8)}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  <RowAction
                    icon={<Copy className="h-3.5 w-3.5" />}
                    label="Copy request id"
                    onRun={() => copy(l.id, "Request id")}
                  />
                  <RowAction
                    icon={<Eye className="h-3.5 w-3.5" />}
                    label="Open detail"
                    onRun={() => {
                      close();
                      navigate(`/dashboard/logs?focus=${l.id}`);
                    }}
                  />
                </div>
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
              <CommandItem onSelect={go("/dashboard/policies/sandbox")}><FlaskConical className="mr-2 h-4 w-4" />Policy sandbox</CommandItem>
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
