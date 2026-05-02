import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Copy, Plus, Trash2, Check } from "lucide-react";
import { useDashboardApi } from "@/lib/api";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

const PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy`;

interface ProviderDef {
  id: string; label: string; managed?: boolean;
  default_model: string; model_suggestions: string[];
  key_placeholder: string; get_key_url: string;
}

const Keys = () => {
  const { call } = useDashboardApi();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["keys"], queryFn: () => call<any>("list_keys") });
  const { data: provData } = useQuery({ queryKey: ["providers"], queryFn: () => call<{ providers: ProviderDef[] }>("list_providers") });
  const providers = provData?.providers ?? [];

  const [open, setOpen] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [providerId, setProviderId] = useState<string>("lovable");
  const [model, setModel] = useState("");
  const [providerKey, setProviderKey] = useState("");

  const selected = providers.find((p) => p.id === providerId);

  // When provider changes, reset model to its default
  const onProviderChange = (id: string) => {
    setProviderId(id);
    const def = providers.find((p) => p.id === id);
    setModel(def?.default_model ?? "");
    setProviderKey("");
  };

  const create = useMutation({
    mutationFn: () => call<any>("create_key", {
      body: {
        name,
        provider: providerId,
        model: model || selected?.default_model,
        provider_key: providerKey || undefined,
      },
    }),
    onSuccess: (res) => { setNewKey(res.full_key); qc.invalidateQueries({ queryKey: ["keys"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => call("revoke_key", { body: { id } }),
    onSuccess: () => { toast.success("Key revoked"); qc.invalidateQueries({ queryKey: ["keys"] }); },
  });

  const reset = () => {
    setOpen(false); setNewKey(null); setName("");
    setProviderId("lovable"); setModel(""); setProviderKey("");
  };
  const copy = (val: string) => { navigator.clipboard.writeText(val); toast.success("Copied"); };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">API Keys</h1>
          <p className="text-muted-foreground text-sm mt-1">Issue keys for each environment. Revoke anytime.</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : reset())}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90">
              <Plus className="h-4 w-4 mr-2" /> New key
            </Button>
          </DialogTrigger>
          <DialogContent>
            {!newKey ? (
              <>
                <DialogHeader><DialogTitle>Create a new API key</DialogTitle></DialogHeader>
                <div className="space-y-4 py-2">
                  <div>
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Production" className="mt-1.5" />
                  </div>
                  <div>
                    <Label>Provider</Label>
                    <Select value={providerId} onValueChange={onProviderChange}>
                      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {providers.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="model">Default model</Label>
                    <Input id="model" value={model || selected?.default_model || ""} onChange={(e) => setModel(e.target.value)} className="mt-1.5 font-mono text-sm" />
                    {selected && selected.model_suggestions.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1.5">
                        Suggestions: {selected.model_suggestions.slice(0, 3).join(", ")}
                      </p>
                    )}
                  </div>
                  {selected && !selected.managed && (
                    <div>
                      <Label htmlFor="ok">{selected.label} API key</Label>
                      <Input id="ok" type="password" value={providerKey} onChange={(e) => setProviderKey(e.target.value)} placeholder={selected.key_placeholder} className="mt-1.5 font-mono text-sm" />
                      <p className="text-xs text-muted-foreground mt-1.5">
                        Encrypted at rest. <a href={selected.get_key_url} target="_blank" rel="noreferrer" className="underline">Get a key →</a>
                      </p>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={reset}>Cancel</Button>
                  <Button onClick={() => create.mutate()} disabled={create.isPending || !name || (!selected?.managed && !providerKey)}>
                    {create.isPending ? "Creating…" : "Create key"}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><Check className="h-5 w-5 text-primary" /> Key created</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <p className="text-sm text-muted-foreground">Copy this key now. You won't be able to see it again.</p>
                  <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs">
                    <code className="flex-1 truncate">{newKey}</code>
                    <Button size="sm" variant="ghost" onClick={() => copy(newKey)}><Copy className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
                <DialogFooter><Button onClick={reset}>Done</Button></DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base font-medium">Your keys</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-24" /> :
            (data?.keys?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No keys yet. Click <strong>New key</strong> to create one.</p>
            ) : (
              <div className="divide-y divide-border">
                {data.keys.map((k: any) => (
                  <div key={k.id} className="py-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{k.name}</p>
                        {!k.is_active && <Badge variant="outline" className="text-xs">revoked</Badge>}
                        <Badge variant="secondary" className="text-xs">{k.provider}</Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="font-mono">{k.key_prefix}…</span>
                        <span>·</span>
                        <span>{k.model_default}</span>
                        <span>·</span>
                        <span>last used {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "never"}</span>
                      </div>
                    </div>
                    {k.is_active && (
                      <Button variant="ghost" size="icon" onClick={() => revoke.mutate(k.id)}>
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base font-medium">Use it in your app</CardTitle></CardHeader>
        <CardContent>
          <pre className="rounded-md border border-border bg-muted/40 p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all">
{`from openai import OpenAI

client = OpenAI(
    base_url="${PROXY_URL.replace(/\/proxy$/, "/proxy")}",
    api_key="ag_live_••••••••",
)

# Note: pass the proxy URL as base_url and your AnveGuard key as api_key.
# The endpoint follows the OpenAI Chat Completions schema.`}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
};

export default Keys;
