import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { compressMessages } from "./compress.ts";

Deno.test("light: collapses whitespace and repeated punctuation", () => {
  const r = compressMessages(
    [{ role: "user", content: "hello   world!!!!!\n\n\n\nhow are you" }],
    "light",
  );
  assert(r.removedChars > 0);
  assert(!/!!!!/.test(r.messages[0].content));
});

Deno.test("balanced: dedupes consecutive identical lines", () => {
  const r = compressMessages(
    [{ role: "user", content: "same\nsame\nsame\ndifferent" }],
    "balanced",
  );
  assertEquals(r.messages[0].content.split("\n").filter((l: string) => l === "same").length, 1);
});

Deno.test("never compresses system messages", () => {
  const sys = { role: "system", content: "do   X!!!!" };
  const r = compressMessages([sys, { role: "user", content: "hi   there" }], "balanced");
  assertEquals(r.messages[0], sys);
});

Deno.test("aggressive: recaps long histories", () => {
  const msgs = Array.from({ length: 12 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `Message number ${i} with some content. Extra detail here.`,
  }));
  const r = compressMessages(msgs, "aggressive");
  assert(r.messages.length < msgs.length);
  assert(r.messages.some((m: any) => /Earlier conversation summary/.test(m.content)));
});

Deno.test("estimate uses chars/4", () => {
  const r = compressMessages(
    [{ role: "user", content: "x".repeat(40) + "\n\n\n\n" + "x".repeat(40) }],
    "light",
  );
  assertEquals(r.estimatedTokensSaved, Math.round(r.removedChars / 4));
});
