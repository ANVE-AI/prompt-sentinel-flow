// Token compression — deterministic, no extra LLM calls.
// Operates on user/assistant messages only; never touches system or tool messages.
//
// Levels:
//   light       — whitespace + zero-width strip + repeated punctuation
//   balanced    — light + dedupe consecutive identical lines + trim long quote blocks
//   aggressive  — balanced + collapse old conversation history into a short recap
//
// Token estimate uses chars/4 (industry approximation; matches what we already use elsewhere).

export type CompressionLevel = "light" | "balanced" | "aggressive";

export interface CompressionResult {
  messages: any[];
  originalChars: number;
  removedChars: number;
  estimatedTokensSaved: number;
}

const ZERO_WIDTH = /[\u200B-\u200D\uFEFF\u2060]/g;

function compressString(input: string, level: CompressionLevel): string {
  if (!input) return input;
  let s = input;

  // light
  s = s.replace(ZERO_WIDTH, "");
  s = s.replace(/[ \t]+/g, " ");
  s = s.replace(/ ?\n ?/g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  s = s.replace(/([!?.])\1{2,}/g, "$1$1");
  s = s.replace(/-{4,}/g, "---");
  s = s.trim();

  if (level === "light") return s;

  // balanced: dedupe consecutive identical non-empty lines
  const lines = s.split("\n");
  const deduped: string[] = [];
  for (const l of lines) {
    const t = l.trimEnd();
    if (deduped.length && deduped[deduped.length - 1].trim() === t.trim() && t.trim() !== "") continue;
    deduped.push(t);
  }
  s = deduped.join("\n");

  // trim long blockquote / fenced runs
  s = trimLongRuns(s, /^>/, 8);

  return s;
}

function trimLongRuns(text: string, prefixRe: RegExp, maxLines: number): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length > maxLines) {
      const head = run.slice(0, Math.floor(maxLines / 2));
      const tail = run.slice(-Math.floor(maxLines / 2));
      const omitted = run.length - head.length - tail.length;
      out.push(...head, `> …[${omitted} lines omitted]…`, ...tail);
    } else {
      out.push(...run);
    }
    run = [];
  };
  for (const l of lines) {
    if (prefixRe.test(l)) { run.push(l); continue; }
    if (run.length) flush();
    out.push(l);
  }
  if (run.length) flush();
  return out.join("\n");
}

function summarizeRecap(msgs: any[]): string {
  const bullets: string[] = [];
  for (const m of msgs) {
    const role = m?.role ?? "user";
    const c = typeof m?.content === "string" ? m.content : "";
    if (!c) continue;
    const firstSentence = c.split(/(?<=[.!?])\s+/)[0]?.trim().slice(0, 200) ?? "";
    if (firstSentence) bullets.push(`- ${role}: ${firstSentence}`);
  }
  return `[Earlier conversation summary]\n${bullets.join("\n")}`;
}

export function compressMessages(
  messages: any[],
  level: CompressionLevel,
): CompressionResult {
  const originalChars = messages.reduce(
    (n, m) => n + (typeof m?.content === "string" ? m.content.length : 0),
    0,
  );

  let working = messages.map((m) => {
    if (!m || typeof m !== "object") return m;
    if (m.role === "system" || m.role === "tool") return m; // never touch
    if (typeof m.content !== "string") return m; // skip multimodal
    return { ...m, content: compressString(m.content, level) };
  });

  if (level === "aggressive") {
    // Keep first system msgs, last 4 turns, recap the middle if > 8 messages total.
    const nonSystem = working.filter((m) => m?.role !== "system");
    if (nonSystem.length > 8) {
      const systems = working.filter((m) => m?.role === "system");
      const tail = nonSystem.slice(-4);
      const middle = nonSystem.slice(0, nonSystem.length - 4);
      const recap = { role: "user", content: summarizeRecap(middle) };
      working = [...systems, recap, ...tail];
    }
  }

  const newChars = working.reduce(
    (n, m) => n + (typeof m?.content === "string" ? m.content.length : 0),
    0,
  );
  const removedChars = Math.max(0, originalChars - newChars);
  return {
    messages: working,
    originalChars,
    removedChars,
    estimatedTokensSaved: Math.round(removedChars / 4),
  };
}
