import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Copy, Plus, Trash2, Check } from "lucide-react";
import { mockApiKeys, type ApiKey } from "@/lib/mock-data";
import { toast } from "sonner";

const Keys = () => {
  const [keys, setKeys] = useState<ApiKey[]>(mockApiKeys);
  const [open, setOpen] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<"lovable" | "openai">("lovable");
  const [model, setModel] = useState("google/gemini-3-flash-preview");
  const [openaiKey, setOpenaiKey] = useState("");

  const create = () => {
    if (!name) return toast.error("Name is required");
    const fake = "ag_live_" + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
    setNewKey(fake);
    setKeys((k) => [
      {
        id: String(Date.now()),
        name,
        prefix: fake.slice(0, 12),
        provider,
        modelDefault: model,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        isActive: true,
      },
      ...k,
    ]);
  };

  const reset = () => {
    setOpen(false);
    setNewKey(null);
    setName("");
    setProvider("lovable");
    setModel("google/gemini-3-flash-preview");
    setOpenaiKey("");
  };

  const copy = (val: string) => {
    navigator.clipboard.writeText(val);
    toast.success("Copied to clipboard");
  };

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
                    <Select value={provider} onValueChange={(v: any) => setProvider(v)}>
                      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lovable">Lovable AI (Gemini, GPT-5)</SelectItem>
                        <SelectItem value="openai">OpenAI (your key)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="model">Default model</Label>
                    <Input id="model" value={model} onChange={(e) => setModel(e.target.value)} className="mt-1.5 font-mono text-sm" />
                  </div>
                  {provider === "openai" && (
                    <div>
                      <Label htmlFor="ok">OpenAI API key</Label>
                      <Input id="ok" type="password" value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)} placeholder="sk-..." className="mt-1.5 font-mono text-sm" />
                      <p className="text-xs text-muted-foreground mt-1.5">Stored encrypted. Used only to forward requests for this AnveGuard key.</p>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={reset}>Cancel</Button>
                  <Button onClick={create}>Create key</Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><Check className="h-5 w-5 text-primary" /> Key created</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <p className="text-sm text-muted-foreground">Copy this key now. You won't be able to see it again.</p>
                  <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-sm">
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
          <div className="divide-y divide-border">
            {keys.map((k) => (
              <div key={k.id} className="py-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{k.name}</p>
                    {!k.isActive && <Badge variant="outline" className="text-xs">revoked</Badge>}
                    <Badge variant="secondary" className="text-xs">{k.provider}</Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground font-mono">
                    <span>{k.prefix}…</span>
                    <span className="font-sans">·</span>
                    <span className="font-sans">{k.modelDefault}</span>
                    <span className="font-sans">·</span>
                    <span className="font-sans">last used {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : "never"}</span>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setKeys((all) => all.map((x) => (x.id === k.id ? { ...x, isActive: false } : x)))}>
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base font-medium">Use it in your app</CardTitle></CardHeader>
        <CardContent>
          <pre className="rounded-md border border-border bg-muted/40 p-4 text-xs font-mono overflow-x-auto">
{`from openai import OpenAI

client = OpenAI(
    base_url="https://api.anveguard.dev/v1",
    api_key="ag_live_••••••••",
)`}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
};

export default Keys;
