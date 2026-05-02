import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Pencil, X, Check, Tags } from "lucide-react";
import { useDashboardApi } from "@/lib/api";
import { toast } from "sonner";

interface AliasRow {
  id: string;
  api_key_id: string;
  alias: string;
  target_model: string;
  target_endpoint_id: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  apiKeyId: string | null;
  apiKeyName: string;
}

/**
 * Per-API-key alias editor. Aliases are nicknames callers can pass in the
 * `model` field that the proxy rewrites to a real upstream model id (and
 * optionally swaps the target endpoint). Useful for stable client code that
 * shouldn't have to track upstream model id churn.
 */
export const AliasesSheet = ({ open, onOpenChange, apiKeyId, apiKeyName }: Props) => {
  const { call } = useDashboardApi();
  const qc = useQueryClient();

  const aliasesQ = useQuery({
    enabled: open && !!apiKeyId,
    queryKey: ["aliases", apiKeyId],
    queryFn: () => call<{ aliases: AliasRow[] }>("list_aliases", { body: { api_key_id: apiKeyId } }),
  });
  const endpointsQ = useQuery({
    enabled: open,
    queryKey: ["endpoints"],
    queryFn: () => call<{ endpoints: any[] }>("list_endpoints"),
  });
  const endpoints = endpointsQ.data?.endpoints ?? [];

  const [draft, setDraft] = useState<{ id?: string; alias: string; target_model: string; target_endpoint_id: string }>({
    alias: "", target_model: "", target_endpoint_id: "",
  });
  useEffect(() => {
    if (!open) setDraft({ alias: "", target_model: "", target_endpoint_id: "" });
  }, [open]);

  const save = useMutation({
    mutationFn: () => call("save_alias", {
      body: {
        id: draft.id,
        api_key_id: apiKeyId,
        alias: draft.alias,
        target_model: draft.target_model,
        target_endpoint_id: draft.target_endpoint_id || null,
      },
    }),
    onSuccess: () => {
      toast.success(draft.id ? "Alias updated" : "Alias added");
      setDraft({ alias: "", target_model: "", target_endpoint_id: "" });
      qc.invalidateQueries({ queryKey: ["aliases", apiKeyId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save alias"),
  });

  const del = useMutation({
    mutationFn: (id: string) => call("delete_alias", { body: { id } }),
    onSuccess: () => {
      toast.success("Alias deleted");
      qc.invalidateQueries({ queryKey: ["aliases", apiKeyId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to delete"),
  });

  const aliases = aliasesQ.data?.aliases ?? [];
  const epById = useMemo(() => new Map(endpoints.map((e: any) => [e.id, e])), [endpoints]);

  const submit = () => {
    if (!draft.alias.trim() || !draft.target_model.trim()) {
      toast.error("Alias and target model are required");
      return;
    }
    save.mutate();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Tags className="h-4 w-4" /> Model aliases
          </SheetTitle>
          <SheetDescription>
            Nicknames the proxy rewrites for <span className="font-medium text-foreground">{apiKeyName}</span>.
            Clients call <code className="font-mono">model: "alias"</code> and the proxy
            forwards as <code className="font-mono">target_model</code>.
          </SheetDescription>
        </SheetHeader>

        {/* Existing aliases */}
        <div className="mt-5">
          <Label className="text-meta">Configured aliases</Label>
          {aliasesQ.isLoading ? (
            <div className="mt-2 text-meta text-muted-foreground">Loading…</div>
          ) : aliases.length === 0 ? (
            <div className="mt-2 text-meta text-muted-foreground italic">
              No aliases yet for this key.
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-border border border-border rounded-md">
              {aliases.map((a) => {
                const ep = a.target_endpoint_id ? epById.get(a.target_endpoint_id) : null;
                return (
                  <li key={a.id} className="px-3 py-2.5 flex items-center gap-3 hover:bg-surface-2/50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="text-body font-mono font-medium">{a.alias}</code>
                        <span className="text-muted-foreground">→</span>
                        <code className="text-body font-mono text-muted-foreground truncate">
                          {a.target_model}
                        </code>
                      </div>
                      {ep && <Badge status="neutral">via {ep.name}</Badge>}
                    </div>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => setDraft({
                        id: a.id, alias: a.alias, target_model: a.target_model,
                        target_endpoint_id: a.target_endpoint_id ?? "",
                      })}
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => del.mutate(a.id)}
                      title="Delete alias"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Add / edit form */}
        <div className="mt-6 border-t border-border pt-5 space-y-3">
          <Label className="text-meta">
            {draft.id ? "Edit alias" : "Add alias"}
          </Label>
          <div>
            <Input
              value={draft.alias}
              onChange={(e) => setDraft({ ...draft, alias: e.target.value })}
              placeholder="alias (e.g. fast, smart)"
              className="font-mono h-9"
            />
            <div className="text-meta text-muted-foreground mt-1">
              1–64 chars, lowercase. Letters, digits, <code>._-:/</code>.
            </div>
          </div>
          <div>
            <Input
              value={draft.target_model}
              onChange={(e) => setDraft({ ...draft, target_model: e.target.value })}
              placeholder="upstream model id (e.g. gpt-4o-mini)"
              className="font-mono h-9"
            />
          </div>
          <div>
            <Select
              value={draft.target_endpoint_id || "__none__"}
              onValueChange={(v) => setDraft({ ...draft, target_endpoint_id: v === "__none__" ? "" : v })}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Use the key's bound endpoint" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Use the key's bound endpoint</SelectItem>
                {endpoints.map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-meta text-muted-foreground mt-1">
              Optional. Routes the alias to a different upstream than the one this key was created for.
            </div>
          </div>
          <div className="flex items-center gap-2 justify-end pt-1">
            {draft.id && (
              <Button
                variant="ghost" size="sm"
                onClick={() => setDraft({ alias: "", target_model: "", target_endpoint_id: "" })}
              >
                <X className="h-3.5 w-3.5 mr-1" /> Cancel edit
              </Button>
            )}
            <Button size="sm" onClick={submit} disabled={save.isPending}>
              {draft.id ? <Check className="h-3.5 w-3.5 mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
              {save.isPending ? "Saving…" : (draft.id ? "Save" : "Add alias")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
