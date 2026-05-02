import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useDashboardApi } from "@/lib/api";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";

const Policies = () => {
  const { call } = useDashboardApi();
  const { data, isLoading } = useQuery({ queryKey: ["policies"], queryFn: () => call<any>("get_policies") });

  const [useDefaults, setUseDefaults] = useState(true);
  const [blocked, setBlocked] = useState("");
  const [allowed, setAllowed] = useState("");
  const [message, setMessage] = useState("This request was blocked by your organization's AI policy.");

  useEffect(() => {
    if (data?.policies) {
      setUseDefaults(data.policies.use_global_defaults);
      setBlocked((data.policies.blocked_keywords ?? []).join("\n"));
      setAllowed((data.policies.allowed_keywords ?? []).join("\n"));
      setMessage(data.policies.block_message);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => call("save_policies", { body: {
      blocked_keywords: blocked.split("\n").map((s) => s.trim()).filter(Boolean),
      allowed_keywords: allowed.split("\n").map((s) => s.trim()).filter(Boolean),
      use_global_defaults: useDefaults,
      block_message: message,
    } }),
    onSuccess: () => toast.success("Policies saved"),
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <div className="px-6 py-5"><Skeleton className="h-96" /></div>;

  return (
    <div className="px-6 py-5 space-y-5 max-w-3xl mx-auto">
      <PageHeader
        title="Policies"
        description="Keyword guardrails applied to every prompt and response."
        actions={
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        }
      />

      {/* Global defaults */}
      <Card className="surface-1 border-border">
        <div className="px-5 pt-4 pb-3 border-b border-border">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Section</div>
          <div className="text-h2 font-medium mt-0.5">Global defaults</div>
        </div>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="font-medium text-body">Apply AnveGuard global defaults</p>
              <p className="text-meta text-muted-foreground mt-1">
                A curated list of obvious prompt-injection terms maintained by AnveGuard.
              </p>
            </div>
            <Switch checked={useDefaults} onCheckedChange={setUseDefaults} />
          </div>
          {useDefaults && (
            <div className="rounded-md border border-border surface-2 p-3">
              <div className="flex flex-wrap gap-1.5">
                {(data?.global_defaults ?? []).map((t: string) => (
                  <Badge key={t} variant="outline" className="font-mono">{t}</Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Overrides */}
      <Card className="surface-1 border-border">
        <div className="px-5 pt-4 pb-3 border-b border-border">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Section</div>
          <div className="text-h2 font-medium mt-0.5">Your overrides</div>
        </div>
        <CardContent className="p-5 space-y-5">
          <div>
            <Label htmlFor="blk" className="text-body">Blocked keywords</Label>
            <p className="text-meta text-muted-foreground mt-0.5 mb-2">
              One term per line. Case-insensitive substring match on prompts and responses.
            </p>
            <Textarea
              id="blk" rows={6} value={blocked}
              onChange={(e) => setBlocked(e.target.value)}
              className="font-mono text-xs surface-2 border-border"
            />
          </div>
          <div>
            <Label htmlFor="alw" className="text-body">Allowed keywords (allowlist exceptions)</Label>
            <p className="text-meta text-muted-foreground mt-0.5 mb-2">
              Terms here override the blocked list when they appear in the same message.
            </p>
            <Textarea
              id="alw" rows={4} value={allowed}
              onChange={(e) => setAllowed(e.target.value)}
              className="font-mono text-xs surface-2 border-border"
            />
          </div>
          <div>
            <Label htmlFor="msg" className="text-body">Block message</Label>
            <Input
              id="msg" value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="mt-1.5 surface-2 border-border"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Policies;
