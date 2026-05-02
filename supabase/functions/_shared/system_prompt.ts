// Validation for the optional top-level `system_prompt` field that callers may
// include in /v1/chat/completions requests. Lives in _shared so the proxy and
// the unit tests can both import it without duplicating limits or messages.

/** Hard cap. ~4k tokens — enough for real guardrails, small enough to deter
 *  prompt-stuffing abuse. */
export const SYSTEM_PROMPT_MAX = 16_000;

/** Disallowed control characters: NUL + C0 controls except \t (\u0009),
 *  \n (\u000A), and \r (\u000D), which are commonly present in prompts. */
// deno-lint-ignore no-control-regex
export const SYSTEM_PROMPT_CONTROL_RE = /[\u0000\u0001-\u0008\u000B\u000C\u000E-\u001F]/;

export type SystemPromptValidation =
  | { error: null; value: string }
  | { error: string; value: "" };

/**
 * Validate a caller-supplied `system_prompt`.
 *
 * Returns `{ error: string }` for any invalid input (caller should respond
 * with 400 + `code: "invalid_request_error"`, `param: "system_prompt"`).
 * Returns `{ error: null, value: trimmed }` on success — value is the empty
 * string when the field was absent / null / undefined.
 */
export function validateSystemPrompt(input: unknown): SystemPromptValidation {
  if (input === undefined || input === null) {
    return { error: null, value: "" };
  }
  if (typeof input !== "string") {
    return { error: "`system_prompt` must be a string.", value: "" };
  }
  if (input.length > SYSTEM_PROMPT_MAX) {
    return {
      error: `\`system_prompt\` is too long: ${input.length} chars (max ${SYSTEM_PROMPT_MAX}).`,
      value: "",
    };
  }
  if (SYSTEM_PROMPT_CONTROL_RE.test(input)) {
    return { error: "`system_prompt` contains disallowed control characters.", value: "" };
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      error: "`system_prompt` cannot be empty or whitespace-only. Omit the field instead.",
      value: "",
    };
  }
  return { error: null, value: trimmed };
}
