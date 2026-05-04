// Validation for the optional top-level `system_prompt` field that callers may
// include in /v1/chat/completions requests. Lives in _shared so the proxy and
// the unit tests can both import it without duplicating limits or messages.

/** Hard cap default. ~4k tokens — enough for real guardrails, small enough
 *  to deter prompt-stuffing abuse. Workspaces can override via
 *  `policy_settings.system_prompt_max_length` within [MIN, ABSOLUTE_MAX]. */
export const SYSTEM_PROMPT_MAX_DEFAULT = 16_000;
export const SYSTEM_PROMPT_MIN_LIMIT = 100;
export const SYSTEM_PROMPT_ABSOLUTE_MAX = 64_000;
/** Backwards-compat alias used by tests written against the original constant. */
export const SYSTEM_PROMPT_MAX = SYSTEM_PROMPT_MAX_DEFAULT;

/** Public docs anchor — surfaced in every system_prompt error envelope so SDK
 *  users can jump straight to the rules without hunting through changelog. */
export const SYSTEM_PROMPT_DOC_URL =
  "https://anveguard.app/docs/proxy-api#system-prompt";

/** Clamp a workspace-supplied limit into the safe range. Falsy/invalid input
 *  falls back to the secure default rather than disabling the cap. */
export function resolveSystemPromptMax(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return SYSTEM_PROMPT_MAX_DEFAULT;
  return Math.min(SYSTEM_PROMPT_ABSOLUTE_MAX, Math.max(SYSTEM_PROMPT_MIN_LIMIT, Math.floor(n)));
}

/** Disallowed control characters: NUL + C0 controls except \t (\u0009),
 *  \n (\u000A), and \r (\u000D), which are commonly present in prompts. */
// deno-lint-ignore no-control-regex
// eslint-disable-next-line no-control-regex
export const SYSTEM_PROMPT_CONTROL_RE = /[\u0000\u0001-\u0008\u000B\u000C\u000E-\u001F]/;

/** Stable machine codes for every failure mode. Safe to branch on from
 *  client SDKs — these never change without a major version bump. */
export type SystemPromptErrorCode =
  | "system_prompt_invalid_type"
  | "system_prompt_too_long"
  | "system_prompt_invalid_chars"
  | "system_prompt_empty";

export type SystemPromptValidation =
  | { error: null; code: null; value: string }
  | { error: string; code: SystemPromptErrorCode; value: "" };

/**
 * Validate a caller-supplied `system_prompt`.
 *
 * Returns `{ error, code }` for any invalid input — the caller wraps these
 * in an OpenAI-style 400 envelope with `param: "system_prompt"` and
 * `type: "invalid_request_error"`. The stable `code` distinguishes the
 * failure mode so SDKs can branch without parsing the message.
 *
 * Returns `{ error: null, code: null, value: trimmed }` on success — value
 * is the empty string when the field was absent.
 */
export function validateSystemPrompt(
  input: unknown,
  maxLength: number = SYSTEM_PROMPT_MAX_DEFAULT,
): SystemPromptValidation {
  if (input === undefined || input === null) {
    return { error: null, code: null, value: "" };
  }
  if (typeof input !== "string") {
    return {
      error: "`system_prompt` must be a string.",
      code: "system_prompt_invalid_type",
      value: "",
    };
  }
  if (input.length > maxLength) {
    return {
      error: `\`system_prompt\` is too long: ${input.length} chars (max ${maxLength}).`,
      code: "system_prompt_too_long",
      value: "",
    };
  }
  if (SYSTEM_PROMPT_CONTROL_RE.test(input)) {
    return {
      error: "`system_prompt` contains disallowed control characters.",
      code: "system_prompt_invalid_chars",
      value: "",
    };
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      error: "`system_prompt` cannot be empty or whitespace-only. Omit the field instead.",
      code: "system_prompt_empty",
      value: "",
    };
  }
  return { error: null, code: null, value: trimmed };
}

/** Stable machine codes for the permission gates that run AFTER validation
 *  succeeds. Distinct from validation codes so callers can tell the
 *  difference between "you sent garbage" and "you're not allowed". */
export type SystemPromptGateCode =
  | "system_prompt_disabled_workspace"
  | "system_prompt_forbidden"
  | "system_prompt_accepted";

export type SystemPromptGateDecision =
  | { allowed: true; status: 200; code: "system_prompt_accepted"; gate: null }
  | {
    allowed: false;
    status: 403;
    code: "system_prompt_disabled_workspace" | "system_prompt_forbidden";
    gate: "workspace" | "key_admin";
  };

/**
 * Permission decision for an already-validated, non-empty `system_prompt`.
 * Encodes the full 2x2 matrix of (workspace allows) × (key is admin) so the
 * proxy and the tests stay in lock-step. The proxy calls this AFTER
 * `validateSystemPrompt` returns success and AFTER confirming the value is
 * non-empty (an empty value never reaches the gates — it's a no-op).
 *
 * | workspace | key admin | result                          |
 * | --------- | --------- | ------------------------------- |
 * | false     | false     | 403 system_prompt_disabled_…    |
 * | false     | true      | 403 system_prompt_disabled_…    |
 * | true      | false     | 403 system_prompt_forbidden     |
 * | true      | true      | 200 system_prompt_accepted      |
 *
 * Workspace gate runs FIRST so an admin key in a locked-down workspace still
 * sees the workspace-level message (which is the more actionable fix).
 */
export function decideSystemPromptGate(opts: {
  workspaceAllows: boolean;
  keyIsAdmin: boolean;
}): SystemPromptGateDecision {
  if (!opts.workspaceAllows) {
    return {
      allowed: false,
      status: 403,
      code: "system_prompt_disabled_workspace",
      gate: "workspace",
    };
  }
  if (!opts.keyIsAdmin) {
    return {
      allowed: false,
      status: 403,
      code: "system_prompt_forbidden",
      gate: "key_admin",
    };
  }
  return { allowed: true, status: 200, code: "system_prompt_accepted", gate: null };
}
