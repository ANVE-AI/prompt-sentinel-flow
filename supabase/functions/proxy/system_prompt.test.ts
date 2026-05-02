import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  validateSystemPrompt,
  SYSTEM_PROMPT_MAX,
} from "../_shared/system_prompt.ts";

// The validator returns plain `{ error, value }`; the proxy wraps `error` in an
// OpenAI-style envelope. We model that wrapping here so the assertions stay
// tied to what real callers will see on the wire.
function envelopeFor(error: string) {
  return {
    error: {
      message: error,
      type: "invalid_request_error",
      param: "system_prompt",
      code: "invalid_request_error",
    },
  };
}

Deno.test("system_prompt: absent field is allowed", () => {
  assertEquals(validateSystemPrompt(undefined), { error: null, value: "" });
  assertEquals(validateSystemPrompt(null), { error: null, value: "" });
});

Deno.test("system_prompt: non-string types are rejected", () => {
  for (const bad of [123, true, {}, [], 1.5]) {
    const r = validateSystemPrompt(bad);
    assert(r.error, `expected error for ${typeof bad}`);
    assertEquals(r.value, "");
    // Envelope shape mirrors what the proxy emits.
    const env = envelopeFor(r.error!);
    assertEquals(env.error.param, "system_prompt");
    assertEquals(env.error.type, "invalid_request_error");
  }
});

Deno.test("system_prompt: empty string is rejected", () => {
  const r = validateSystemPrompt("");
  assert(r.error?.includes("empty"));
});

Deno.test("system_prompt: whitespace-only is rejected", () => {
  const r = validateSystemPrompt("   \n\t  ");
  assert(r.error?.includes("empty or whitespace-only"));
});

Deno.test("system_prompt: trims surrounding whitespace on success", () => {
  const r = validateSystemPrompt("  hello world  ");
  assertEquals(r, { error: null, value: "hello world" });
});

Deno.test("system_prompt: at the max length is accepted", () => {
  const s = "a".repeat(SYSTEM_PROMPT_MAX);
  const r = validateSystemPrompt(s);
  assertEquals(r.error, null);
  assertEquals(r.value.length, SYSTEM_PROMPT_MAX);
});

Deno.test("system_prompt: one over the max length is rejected", () => {
  const s = "a".repeat(SYSTEM_PROMPT_MAX + 1);
  const r = validateSystemPrompt(s);
  assert(r.error?.includes("too long"));
  assert(r.error?.includes(String(SYSTEM_PROMPT_MAX + 1)));
});

Deno.test("system_prompt: NUL byte is rejected", () => {
  const r = validateSystemPrompt("hello\u0000world");
  assert(r.error?.includes("control characters"));
});

Deno.test("system_prompt: other C0 control characters are rejected", () => {
  // \u0001 through \u001F (excluding the whitelisted \t \n \r).
  for (const cp of [0x01, 0x02, 0x07, 0x0B, 0x0C, 0x0E, 0x1F]) {
    const r = validateSystemPrompt(`hi${String.fromCharCode(cp)}there`);
    assert(r.error, `expected error for U+${cp.toString(16).padStart(4, "0")}`);
  }
});

Deno.test("system_prompt: tab/newline/CR are allowed", () => {
  const r = validateSystemPrompt("line1\nline2\twith tab\r\nline3");
  assertEquals(r.error, null);
  assert(r.value.includes("\n"));
  assert(r.value.includes("\t"));
});

Deno.test("system_prompt: produces correct OpenAI error envelope on failure", () => {
  const r = validateSystemPrompt(42);
  const env = envelopeFor(r.error!);
  assertEquals(Object.keys(env.error).sort(), ["code", "message", "param", "type"]);
  assertEquals(env.error.param, "system_prompt");
  assertEquals(env.error.type, "invalid_request_error");
  assert(typeof env.error.message === "string" && env.error.message.length > 0);
});
