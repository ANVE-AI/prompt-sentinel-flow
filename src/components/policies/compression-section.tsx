import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Zap, Save } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useDashboardApi } from "@/lib/api";

/**
 * Token Compression — workspace-level controls. Per-key overrides live on the
 * Keys page. Compression never touches system or tool messages.
 */

type Draft = {
  enable_compression: boolean;
  compression_level: "light" | "balanced" | "aggressive";
  compression_min_chars: number;
};

const EMPTY: Draft = {
  enable_compression: false,
  compression_level: "balanced",
  compression_min_chars: 400,
};

export function CompressionSection() {
  const { call } = useDashboardApi();
  const qc = useQueryClient();

  const settingsQ = useQuery<{ settings: any }>({
    queryKey: ["policy_settings"],
    queryFn: () => call("get_policy_settings"),
  });

  const snapshot: Draft = useMemo(() => {
    const s = settingsQ.data?.settings;
    if (!s) return EMPTY;
    return {
      enable_compression: !!s.enable_compression,
      compression_level: (["light", "balanced", "aggressive"].includes(s.compression_level)
        ? s.compression_level : "balanced") as Draft["compression_level"],
      compression_min_chars: Number.isFinite(Number(s.compression_min_chars))
        ? Math.max(0, Math.min(100000, Math.floor(Number(s.compression_min_chars)))) : 400,
    };
  }, [settingsQ.data]);

  const [draft, setDraft] = useState<Draft>(EMPTY);
  useEffect(() => { setDraft(snapshot); }, [snapshot]);

  const dirty =
    draft.enable_compression !== snapshot.enable_compression ||
    draft.compression_level !== snapshot.compression_level ||
    draft.compression_min_chars !== snapshot.compression_min_chars;

  const save = useMutation({
    mutationFn: () => call("save_policy_settings", {
      body: {
        enable_compression: draft.enable_compression,
        compression_level: draft.compression_level,
        compression_min_chars: draft.compression_min_chars,
      },
    }),
    onSuccess: () => {
      toast.success("Compression settings saved");
      qc.invalidateQueries({ queryKey: ["policy_settings"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  return (
    <Card className="surface-1 border-border">
      <CardContent className="p-5 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-primary/10 text-primary p-2">
              <Zap className="h-4 w-4" />
            </div>
            <div>
              <div className="text-h2 font-medium">Token compression</div>
              <p className="text-meta text-muted-foreground mt-1 max-w-prose">
                Reduce upstream prompt size to save tokens and cost. Deterministic
                rewrites only — no extra LLM call. System and tool messages are
                never touched.
              </p>
            </div>
          </div>
          <Button
            size="sm" disabled={!dirty || save.isPending}
            onClick={() => save.mutate()}
          >
            <Save className="h-3.5 w-3.5 mr-1.5" /> Save
          </Button>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div className="flex items-center justify-between gap-3 sm:col-span-3 rounded-md border border-border bg-surface-2 px-3 py-2.5">
            <div>
              <Label className="text-body">Enable compression</Label>
              <p className="text-meta text-muted-foreground">
                Default for all keys (per-key override available on the Keys page).
              </p>
            </div>
            <Switch
              checked={draft.enable_compression}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, enable_compression: v }))}
            />
          </div>

          <div>
            <Label className="text-meta text-muted-foreground">Compression level</Label>
            <Select
              value={draft.compression_level}
              onValueChange={(v) => setDraft((d) => ({ ...d, compression_level: v as Draft["compression_level"] }))}
            >
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light — whitespace + noise</SelectItem>
                <SelectItem value="balanced">Balanced — + dedupe lines</SelectItem>
                <SelectItem value="aggressive">Aggressive — + history recap</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-meta text-muted-foreground">Min characters</Label>
            <Input
              type="number" min={0} max={100000}
              className="mt-1.5"
              value={draft.compression_min_chars}
              onChange={(e) => setDraft((d) => ({
                ...d,
                compression_min_chars: Math.max(0, Math.min(100000, Math.floor(Number(e.target.value) || 0))),
              }))}
            />
            <p className="text-[11px] text-muted-foreground mt-1">Skip prompts shorter than this.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
