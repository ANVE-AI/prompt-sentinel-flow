import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useDashboardApi } from "@/lib/api";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonBlock } from "@/components/skeletons";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { KeywordChipInput } from "@/components/keyword-chip-input";
import { ShieldAlert } from "lucide-react";

const Policies = () => {
  const { call } = useDashboardApi();
  const { data, isLoading } = useQuery({ queryKey: ["policies"], queryFn: () => call<any>("get_policies") });

  const [useDefaults, setUseDefaults] = useState(true);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [allowed, setAllowed] = useState<string[]>([]);
  const [message, setMessage] = useState("This request was blocked by your organization's AI policy.");

  useEffect(() => {
    if (data?.policies) {
      setUseDefaults(data.policies.use_global_defaults);
      setBlocked(data.policies.blocked_keywords ?? []);
      setAllowed(data.policies.allowed_keywords ?? []);
      setMessage(data.policies.block_message);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => call("save_policies", { body: {
      blocked_keywords: blocked,
      allowed_keywords: allowed,
      use_global_defaults: useDefaults,
      block_message: message,
    } }),
    onSuccess: () => toast.success("Policies saved"),
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) {
    // Mirror the resolved layout: header + two stacked policy cards. Avoids a
    // visible reflow when data lands.
    return (
      <div className="px-4 md:px-6 py-5 max-w-4xl mx-auto space-y-5">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-72" />
        <SkeletonBlock variant="card" className="rounded-lg border border-border surface-1" />
        <SkeletonBlock variant="card" className="rounded-lg border border-border surface-1" />
      </div>
    );
  }

  return (
    <div className="px-4 md:px-6 py-5 space-y-5 max-w-4xl mx-auto">
      <PageHeader
        title="Policies"
        description="Keyword guardrails applied to every prompt and response."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <a href="/dashboard/policies/sandbox">Open sandbox</a>
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
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

      {/* Overrides — two columns on lg+ */}
      <Card className="surface-1 border-border">
        <div className="px-5 pt-4 pb-3 border-b border-border">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Section</div>
          <div className="text-h2 font-medium mt-0.5">Your overrides</div>
        </div>
        <CardContent className="p-5 grid lg:grid-cols-2 gap-5">
          <div>
            <Label htmlFor="blk" className="text-body">Blocked keywords</Label>
            <p className="text-meta text-muted-foreground mt-0.5 mb-2">
              Case-insensitive substring match on prompts and responses.
            </p>
            <KeywordChipInput id="blk" value={blocked} onChange={setBlocked} placeholder="Add a blocked keyword and press Enter" />
            <p className="text-meta text-muted-foreground mt-2 tabular-nums">{blocked.length} term{blocked.length === 1 ? "" : "s"}</p>
          </div>
          <div>
            <Label htmlFor="alw" className="text-body">Allowed keywords <span className="text-muted-foreground">(allowlist exceptions)</span></Label>
            <p className="text-meta text-muted-foreground mt-0.5 mb-2">
              Override the blocked list when they appear in the same message.
            </p>
            <KeywordChipInput id="alw" value={allowed} onChange={setAllowed} placeholder="Add an allowed keyword and press Enter" />
            <p className="text-meta text-muted-foreground mt-2 tabular-nums">{allowed.length} term{allowed.length === 1 ? "" : "s"}</p>
          </div>
        </CardContent>
      </Card>

      {/* Block message + live preview */}
      <Card className="surface-1 border-border">
        <div className="px-5 pt-4 pb-3 border-b border-border">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Section</div>
          <div className="text-h2 font-medium mt-0.5">Block message</div>
        </div>
        <CardContent className="p-5 space-y-4">
          <div>
            <Label htmlFor="msg" className="text-body">Message returned to the caller when a request is blocked</Label>
            <Input
              id="msg" value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="mt-1.5 surface-2 border-border"
            />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Preview</div>
            <div className="rounded-md border border-border-strong surface-2 p-3 flex items-start gap-3">
              <div className="grid place-items-center h-7 w-7 rounded-md border border-border bg-background shrink-0">
                <ShieldAlert className="h-3.5 w-3.5 text-status-block" />
              </div>
              <div className="min-w-0">
                <div className="inline-flex items-center gap-1.5 text-meta">
                  <span className="h-1.5 w-1.5 rounded-full bg-status-block" />
                  <span className="text-status-block font-medium">Blocked</span>
                </div>
                <div className="text-body mt-1">{message || "—"}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Policies;
