import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Chip-input for keyword lists. Replaces the raw Textarea pattern in
 * the Policies editor — feels like a real policy console instead of a
 * config file. Enter / comma to add, Backspace on empty input to remove
 * the last chip, click ✕ to remove a specific one.
 */
export const KeywordChipInput = ({
  value,
  onChange,
  placeholder = "Add a keyword and press Enter",
  id,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  id?: string;
}) => {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const v = raw.trim().toLowerCase();
    if (!v) return;
    if (value.includes(v)) {
      setDraft("");
      return;
    }
    onChange([...value, v]);
    setDraft("");
  };

  const remove = (kw: string) => onChange(value.filter((v) => v !== kw));

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div
      className={cn(
        "flex flex-wrap gap-1.5 min-h-[44px] rounded-md border border-border bg-surface-2 px-2 py-1.5",
        "focus-within:border-border-strong transition-colors"
      )}
      onClick={() => document.getElementById(id ?? "")?.focus()}
    >
      {value.map((kw) => (
        <span
          key={kw}
          className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded border border-border bg-background text-meta font-mono text-foreground"
        >
          {kw}
          <button
            onClick={(e) => { e.stopPropagation(); remove(kw); }}
            className="inline-flex items-center justify-center h-4 w-4 rounded text-muted-foreground hover:text-foreground hover:bg-surface-3"
            aria-label={`Remove ${kw}`}
            type="button"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => draft && add(draft)}
        placeholder={value.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[140px] bg-transparent outline-none text-body placeholder:text-muted-foreground h-6"
      />
    </div>
  );
};
