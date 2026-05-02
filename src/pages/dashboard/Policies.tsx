import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { globalDefaultBlockedTerms } from "@/lib/mock-data";
import { toast } from "sonner";

const Policies = () => {
  const [useDefaults, setUseDefaults] = useState(true);
  const [blocked, setBlocked] = useState("password\nleak");
  const [allowed, setAllowed] = useState("");
  const [message, setMessage] = useState("This request was blocked by your organization's AI policy.");

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Policies</h1>
        <p className="text-muted-foreground text-sm mt-1">Keyword guardrails applied to every prompt and response.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base font-medium">Global defaults</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="font-medium text-sm">Apply AnveGuard global defaults</p>
              <p className="text-xs text-muted-foreground mt-1">A curated list of obvious prompt-injection and unsafe terms maintained by AnveGuard.</p>
            </div>
            <Switch checked={useDefaults} onCheckedChange={setUseDefaults} />
          </div>
          {useDefaults && (
            <div className="rounded-md border border-border bg-muted/40 p-3">
              <div className="flex flex-wrap gap-1.5">
                {globalDefaultBlockedTerms.map((t) => (
                  <span key={t} className="text-xs font-mono px-2 py-0.5 rounded bg-card border border-border">{t}</span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base font-medium">Your overrides</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label htmlFor="blk">Blocked keywords</Label>
            <p className="text-xs text-muted-foreground mt-0.5 mb-2">One term per line. Case-insensitive substring match on prompts and responses.</p>
            <Textarea id="blk" rows={6} value={blocked} onChange={(e) => setBlocked(e.target.value)} className="font-mono text-sm" />
          </div>
          <div>
            <Label htmlFor="alw">Allowed keywords (allowlist exceptions)</Label>
            <p className="text-xs text-muted-foreground mt-0.5 mb-2">Terms here override the blocked list when they appear in the same message.</p>
            <Textarea id="alw" rows={4} value={allowed} onChange={(e) => setAllowed(e.target.value)} className="font-mono text-sm" />
          </div>
          <div>
            <Label htmlFor="msg">Block message</Label>
            <Input id="msg" value={message} onChange={(e) => setMessage(e.target.value)} className="mt-1.5" />
          </div>
          <div className="flex justify-end">
            <Button onClick={() => toast.success("Policies saved")}>Save changes</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Policies;
