import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { History, Loader2, RotateCcw } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDashboardApi } from "@/lib/api";

type VersionRow = {
  id: string;
  version: number;
  name: string;
  description: string | null;
  change_note: string | null;
  created_at: string;
  created_by: string | null;
  applies_to_intents: string[] | null;
};

type VersionDetail = VersionRow & {
  policy: Record<string, any>;
  settings: Record<string, any>;
  rules: Array<Record<string, any>>;
};

export function TemplateHistoryDialog({
  open, onOpenChange, templateId, templateName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  templateId: string | null;
  templateName: string;
}) {
  const { call } = useDashboardApi();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<number | null>(null);
  const [confirmRollback, setConfirmRollback] = useState<number | null>(null);

  const listQ = useQuery<{ current_version: number; versions: VersionRow[] }>({
    queryKey: ["policy_template_versions", templateId],
    queryFn: () => call("list_policy_template_versions", { body: { template_id: templateId } }),
    enabled: open && !!templateId,
  });

  const detailQ = useQuery<{ version: VersionDetail }>({
    queryKey: ["policy_template_version", templateId, selected],
    queryFn: () => call("get_policy_template_version", {
      body: { template_id: templateId, version: selected },
    }),
    enabled: open && !!templateId && selected !== null,
  });

  const rollback = useMutation({
    mutationFn: (version: number) => call("rollback_policy_template", {
      body: { template_id: templateId, version },
    }),
    onSuccess: (_d, version) => {
      toast.success(`Rolled back to v${version}`);
      qc.invalidateQueries({ queryKey: ["policy_templates"] });
      qc.invalidateQueries({ queryKey: ["policy_template_versions", templateId] });
      setConfirmRollback(null);
      setSelected(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Rollback failed"),
  });

  const versions = listQ.data?.versions ?? [];
  const current = listQ.data?.current_version;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setSelected(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              Version history — {templateName}
            </DialogTitle>
            <DialogDescription>
              Every save creates a new version. Roll back to restore an earlier
              snapshot — a new version is recorded so nothing is lost.
            </DialogDescription>
          </DialogHeader>

          <div className="grid md:grid-cols-[220px_1fr] gap-4">
            <ScrollArea className="h-[420px] border border-border rounded-md surface-1">
              <div className="p-2 space-y-1">
                {listQ.isLoading && (
                  <div className="text-meta text-muted-foreground p-2 inline-flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> loading…
                  </div>
                )}
                {!listQ.isLoading && versions.length === 0 && (
                  <p className="text-meta text-muted-foreground p-2">No versions yet.</p>
                )}
                {versions.map((v) => {
                  const isSel = selected === v.version;
                  const isCur = v.version === current;
                  return (
                    <button
                      key={v.id}
                      onClick={() => setSelected(v.version)}
                      className={`w-full text-left rounded-md px-2 py-1.5 text-meta border transition-colors ${
                        isSel
                          ? "border-primary surface-2"
                          : "border-transparent hover:surface-2 hover:border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">v{v.version}</span>
                        {isCur && <Badge variant="outline" className="text-meta">current</Badge>}
                      </div>
                      <div className="text-muted-foreground truncate">
                        {new Date(v.created_at).toLocaleString()}
                      </div>
                      {v.change_note && (
                        <div className="text-muted-foreground truncate">{v.change_note}</div>
                      )}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>

            <div className="border border-border rounded-md surface-1 h-[420px] flex flex-col">
              {selected === null ? (
                <div className="m-auto text-meta text-muted-foreground">
                  Select a version to preview its snapshot.
                </div>
              ) : detailQ.isLoading ? (
                <div className="m-auto text-meta text-muted-foreground inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> loading…
                </div>
              ) : detailQ.data?.version ? (
                <VersionPreview
                  v={detailQ.data.version}
                  isCurrent={detailQ.data.version.version === current}
                  onRollback={() => setConfirmRollback(detailQ.data!.version.version)}
                  rolling={rollback.isPending}
                />
              ) : (
                <div className="m-auto text-meta text-muted-foreground">No data.</div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmRollback !== null} onOpenChange={(o) => !o && setConfirmRollback(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Roll back to v{confirmRollback}?</AlertDialogTitle>
            <AlertDialogDescription>
              The template will be restored to this snapshot. A new version will
              be recorded so the current state is preserved in history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rollback.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={rollback.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (confirmRollback !== null) rollback.mutate(confirmRollback);
              }}
            >
              {rollback.isPending ? "Rolling back…" : "Roll back"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function VersionPreview({
  v, isCurrent, onRollback, rolling,
}: {
  v: VersionDetail;
  isCurrent: boolean;
  onRollback: () => void;
  rolling: boolean;
}) {
  const ruleCount = Array.isArray(v.rules) ? v.rules.length : 0;
  const settingsCount = Object.keys(v.settings ?? {}).length;
  const blocked = (v.policy?.blocked_keywords ?? []).length;
  const allowed = (v.policy?.allowed_keywords ?? []).length;
  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border flex items-center justify-between gap-2">
        <div>
          <div className="text-body font-medium">{v.name} <span className="text-muted-foreground">v{v.version}</span></div>
          <div className="text-meta text-muted-foreground">
            {new Date(v.created_at).toLocaleString()}
            {v.change_note ? ` · ${v.change_note}` : ""}
          </div>
        </div>
        <Button
          size="sm" variant="outline"
          disabled={isCurrent || rolling}
          onClick={onRollback}
          title={isCurrent ? "This is the current version" : "Roll back to this version"}
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1" />
          {isCurrent ? "Current" : "Roll back"}
        </Button>
      </div>
      <ScrollArea className="flex-1 p-3">
        <div className="space-y-3 text-meta">
          {v.description && <p className="text-muted-foreground">{v.description}</p>}
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline">{ruleCount} rule{ruleCount === 1 ? "" : "s"}</Badge>
            <Badge variant="outline">{settingsCount} setting{settingsCount === 1 ? "" : "s"}</Badge>
            <Badge variant="outline">{blocked + allowed} keyword{blocked + allowed === 1 ? "" : "s"}</Badge>
            <Badge variant="outline">
              {(v.applies_to_intents?.length ?? 0)
                ? `Intents: ${v.applies_to_intents!.slice(0, 3).join(", ")}${(v.applies_to_intents!.length > 3) ? "…" : ""}`
                : "All intents"}
            </Badge>
          </div>
          {ruleCount > 0 && (
            <div className="space-y-1">
              <div className="uppercase tracking-wide text-muted-foreground">Rules</div>
              <ul className="space-y-1">
                {(v.rules as any[]).map((r, i) => (
                  <li key={i} className="border border-border rounded px-2 py-1">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-muted-foreground">
                      {r.kind} · {r.severity} · {r.direction}
                      {r.applies_to_intents?.length ? ` · intents: ${r.applies_to_intents.join(", ")}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <details className="rounded border border-border">
            <summary className="px-2 py-1 cursor-pointer text-muted-foreground">Raw snapshot</summary>
            <pre className="p-2 text-meta overflow-auto">
{JSON.stringify({ policy: v.policy, settings: v.settings, rules: v.rules }, null, 2)}
            </pre>
          </details>
        </div>
      </ScrollArea>
    </div>
  );
}
