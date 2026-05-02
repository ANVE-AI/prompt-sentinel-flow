import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDashboardApi } from "@/lib/api";
import { Tag, Plus, Pencil, Trash2, Lock } from "lucide-react";

/**
 * Manage the catalog of intents that the template intent-routing selector
 * exposes. Built-in intents (classifier defaults) are read-only; custom
 * intents are full CRUD.
 */

type KnownIntent = {
  id: string;
  name: string;
  label: string | null;
  description: string | null;
  examples: string[];
  keywords: string[];
};

type Draft = {
  id?: string;
  name: string;
  label: string;
  description: string;
  examples: string;
  keywords: string;
};

const EMPTY_DRAFT: Draft = { name: "", label: "", description: "", examples: "", keywords: "" };

export function KnownIntentsSection() {
  const { call } = useDashboardApi();
  const qc = useQueryClient();

  const listQ = useQuery<{ intents: KnownIntent[]; builtin: string[] }>({
    queryKey: ["known_intents"],
    queryFn: () => call("list_known_intents"),
  });

  const [editing, setEditing] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<KnownIntent | null>(null);

  const save = useMutation({
    mutationFn: (d: Draft) =>
      call("save_known_intent", {
        body: {
          id: d.id,
          name: d.name,
          label: d.label || null,
          description: d.description || null,
          examples: splitLines(d.examples),
          keywords: splitCommas(d.keywords),
        },
      }),
    onSuccess: () => {
      toast.success(editing?.id ? "Intent updated" : "Intent created");
      qc.invalidateQueries({ queryKey: ["known_intents"] });
      qc.invalidateQueries({ queryKey: ["policy_settings"] });
      setEditing(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => call("delete_known_intent", { body: { id } }),
    onSuccess: () => {
      toast.success("Intent deleted");
      qc.invalidateQueries({ queryKey: ["known_intents"] });
      qc.invalidateQueries({ queryKey: ["policy_settings"] });
      setConfirmDelete(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to delete"),
  });

  const builtin = listQ.data?.builtin ?? [];
  const custom = listQ.data?.intents ?? [];

  return (
    <>
      <Card className="surface-1 border-border">
        <div className="px-5 pt-4 pb-3 border-b border-border flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Catalog</div>
            <div className="text-h2 font-medium mt-0.5 flex items-center gap-2">
              <Tag className="h-4 w-4 text-primary" />
              Known intents
            </div>
            <p className="text-meta text-muted-foreground mt-1 max-w-prose">
              Define the intent labels that show up when scoping a policy template's intent
              routing. Built-in classifier intents are always available; add your own to
              capture domain-specific buckets like <span className="font-mono">billing</span> or
              <span className="font-mono"> support_ticket</span>.
            </p>
          </div>
          <Button size="sm" onClick={() => setEditing({ ...EMPTY_DRAFT })}>
            <Plus className="h-3.5 w-3.5 mr-1" /> New intent
          </Button>
        </div>

        <CardContent className="p-5 space-y-5">
          <div>
            <div className="text-meta uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <Lock className="h-3 w-3" /> Built-in
            </div>
            <div className="flex flex-wrap gap-1.5">
              {builtin.map((b) => (
                <Badge key={b} variant="outline" className="font-mono text-[10px]">{b}</Badge>
              ))}
              {builtin.length === 0 && (
                <span className="text-meta text-muted-foreground">—</span>
              )}
            </div>
          </div>

          <div>
            <div className="text-meta uppercase tracking-wider text-muted-foreground mb-2">
              Custom ({custom.length})
            </div>
            {listQ.isLoading ? (
              <div className="text-meta text-muted-foreground">Loading…</div>
            ) : custom.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-meta text-muted-foreground">
                No custom intents yet. Click <span className="font-medium">New intent</span> to add one.
              </div>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border surface-2">
                {custom.map((it) => (
                  <li key={it.id} className="p-3 flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-body">{it.name}</span>
                        {it.label && (
                          <span className="text-meta text-muted-foreground">· {it.label}</span>
                        )}
                      </div>
                      {it.description && (
                        <p className="text-meta text-muted-foreground mt-1">{it.description}</p>
                      )}
                      {(it.keywords?.length ?? 0) > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {it.keywords.map((k) => (
                            <Badge key={k} variant="outline" className="text-[10px]">{k}</Badge>
                          ))}
                        </div>
                      )}
                      {(it.examples?.length ?? 0) > 0 && (
                        <div className="text-meta text-muted-foreground mt-1.5 italic">
                          {it.examples.length} example{it.examples.length === 1 ? "" : "s"}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setEditing({
                            id: it.id,
                            name: it.name,
                            label: it.label ?? "",
                            description: it.description ?? "",
                            examples: (it.examples ?? []).join("\n"),
                            keywords: (it.keywords ?? []).join(", "),
                          })
                        }
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmDelete(it)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <IntentEditor
        draft={editing}
        onChange={setEditing}
        onSave={() => editing && save.mutate(editing)}
        saving={save.isPending}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete intent?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-mono">{confirmDelete?.name}</span> will be removed from the
              selector. Templates already scoped to it will keep the value but it will appear
              as a custom string until re-added.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && remove.mutate(confirmDelete.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function IntentEditor({
  draft, onChange, onSave, saving,
}: {
  draft: Draft | null;
  onChange: (d: Draft | null) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const open = !!draft;
  // Live-preview the slug we'll persist.
  const slug = useMemo(() => slugify(draft?.name ?? ""), [draft?.name]);
  const isEditing = !!draft?.id;

  // When opening for "new", focus name; nothing to do on close.
  useEffect(() => { /* noop */ }, [open]);

  const update = (patch: Partial<Draft>) => {
    if (!draft) return;
    onChange({ ...draft, ...patch });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onChange(null)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit intent" : "New intent"}</DialogTitle>
        </DialogHeader>
        {draft && (
          <div className="space-y-4 py-1">
            <div>
              <Label htmlFor="intent-name">Name</Label>
              <Input
                id="intent-name"
                value={draft.name}
                onChange={(e) => update({ name: e.target.value })}
                placeholder="e.g. billing"
                className="mt-1.5 font-mono"
                autoFocus={!isEditing}
                disabled={isEditing}
              />
              <p className="text-meta text-muted-foreground mt-1">
                {isEditing ? (
                  <>Renaming is disabled — delete and recreate to change the slug.</>
                ) : (
                  <>Persisted as <span className="font-mono">{slug || "—"}</span> (lowercase, underscores).</>
                )}
              </p>
            </div>
            <div>
              <Label htmlFor="intent-label">Display label (optional)</Label>
              <Input
                id="intent-label"
                value={draft.label}
                onChange={(e) => update({ label: e.target.value })}
                placeholder="e.g. Billing & invoices"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="intent-desc">Description (optional)</Label>
              <Textarea
                id="intent-desc"
                value={draft.description}
                onChange={(e) => update({ description: e.target.value })}
                placeholder="When does this intent apply? Used as documentation only."
                className="mt-1.5 min-h-[70px]"
              />
            </div>
            <div>
              <Label htmlFor="intent-keywords">Keywords (comma-separated)</Label>
              <Input
                id="intent-keywords"
                value={draft.keywords}
                onChange={(e) => update({ keywords: e.target.value })}
                placeholder="invoice, refund, charge"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="intent-examples">Example prompts (one per line)</Label>
              <Textarea
                id="intent-examples"
                value={draft.examples}
                onChange={(e) => update({ examples: e.target.value })}
                placeholder={"Why was I charged twice?\nCan I get a refund for last month?"}
                className="mt-1.5 min-h-[90px] font-mono text-xs"
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onChange(null)}>Cancel</Button>
          <Button
            onClick={onSave}
            disabled={saving || !draft?.name.trim()}
          >
            {saving ? "Saving…" : isEditing ? "Save changes" : "Create intent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
}

function splitLines(s: string): string[] {
  return s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

function splitCommas(s: string): string[] {
  return s.split(",").map((l) => l.trim()).filter(Boolean);
}
