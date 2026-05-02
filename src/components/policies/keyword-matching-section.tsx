import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles } from "lucide-react";
import { useDashboardApi } from "@/lib/api";
import { toast } from "sonner";

export function KeywordMatchingSection() {
  const { call } = useDashboardApi();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ settings: any }>({
    queryKey: ["policy_settings"],
    queryFn: () => call("get_policy_settings"),
  });

  const [fuzzy, setFuzzy] = useState(true);
  const [semantic, setSemantic] = useState(false);
  const [threshold, setThreshold] = useState(0.78);

  useEffect(() => {
    const s = data?.settings;
    if (!s) return;
    setFuzzy(s.enable_fuzzy_keywords !== false);
    setSemantic(s.enable_semantic_keywords === true);
    if (typeof s.semantic_threshold === "number") setThreshold(s.semantic_threshold);
  }, [data]);

  const save = useMutation({
    mutationFn: () => call("save_policy_settings", {
      body: {
        enable_fuzzy_keywords: fuzzy,
        enable_semantic_keywords: semantic,
        semantic_threshold: threshold,
      },
    }),
    onSuccess: () => { toast.success("Keyword matching saved"); qc.invalidateQueries({ queryKey: ["policy_settings"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  return (
    <Card>
      <CardContent className="space-y-6 p-6">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-foreground-muted" />
            <h2 className="text-h4">Smarter keyword matching</h2>
            <Badge variant="outline">bypass-resistant</Badge>
          </div>
          <p className="text-body-sm text-foreground-muted mt-1 max-w-2xl">
            Catch blocked-keyword bypasses that exact substring matching misses.
            Applies to both your overrides and the AnveGuard global defaults.
          </p>
        </div>

        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
              <div>
                <div className="font-medium">Fuzzy matching</div>
                <p className="text-body-sm text-foreground-muted mt-1">
                  Match through unicode/leetspeak (<code>j@ilbr3ak</code>), spacing tricks
                  (<code>j a i l b r e a k</code>), and small typos (<code>jaiilbreak</code>) using
                  bounded edit distance. Low false-positive rate.
                </p>
              </div>
              <Switch checked={fuzzy} onCheckedChange={setFuzzy} aria-label="Enable fuzzy matching" />
            </div>

            <div className="rounded-lg border border-border p-4 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-medium">Semantic matching (AI)</div>
                  <p className="text-body-sm text-foreground-muted mt-1">
                    Use Lovable AI to detect prompts whose <em>meaning</em> matches a blocked
                    term, even when the words are different (paraphrases, synonyms, indirection,
                    other languages). Adds one classifier call per request.
                  </p>
                </div>
                <Switch checked={semantic} onCheckedChange={setSemantic} aria-label="Enable semantic matching" />
              </div>
              <div className={semantic ? "" : "opacity-50 pointer-events-none"}>
                <Label htmlFor="sem_threshold" className="text-body-sm">
                  Confidence threshold: <span className="tabular-nums">{threshold.toFixed(2)}</span>
                </Label>
                <Input
                  id="sem_threshold"
                  type="range"
                  min={0.5}
                  max={0.95}
                  step={0.01}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="mt-2"
                />
                <div className="flex justify-between text-meta text-foreground-muted mt-1">
                  <span>more aggressive (0.50)</span>
                  <span>fewer false positives (0.95)</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
