// Mock data used until Lovable Cloud is enabled and the backend is wired up.

export type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  provider: "lovable" | "openai";
  modelDefault: string;
  createdAt: string;
  lastUsedAt: string | null;
  isActive: boolean;
};

export type LogStatus = "allowed" | "blocked_input" | "blocked_output" | "error";

export type RequestLog = {
  id: string;
  apiKeyName: string;
  provider: "lovable" | "openai";
  model: string;
  status: LogStatus;
  blockReason?: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  createdAt: string;
  prompt: string;
  response: string;
};

export const mockApiKeys: ApiKey[] = [
  {
    id: "1",
    name: "Production",
    prefix: "ag_live_a3f9",
    provider: "lovable",
    modelDefault: "google/gemini-3-flash-preview",
    createdAt: "2026-04-12T10:00:00Z",
    lastUsedAt: "2026-05-02T08:14:00Z",
    isActive: true,
  },
  {
    id: "2",
    name: "Staging",
    prefix: "ag_live_b71c",
    provider: "openai",
    modelDefault: "gpt-4o-mini",
    createdAt: "2026-03-28T09:00:00Z",
    lastUsedAt: "2026-05-01T22:01:00Z",
    isActive: true,
  },
  {
    id: "3",
    name: "Local dev",
    prefix: "ag_live_c8d2",
    provider: "lovable",
    modelDefault: "google/gemini-2.5-flash",
    createdAt: "2026-02-10T12:00:00Z",
    lastUsedAt: null,
    isActive: false,
  },
];

const samplePrompts = [
  "Summarize this support ticket in two sentences.",
  "Translate the following paragraph to Spanish.",
  "Write a friendly reply to this customer email.",
  "Explain quantum tunneling like I'm five.",
  "Generate three product taglines for a hiking app.",
];

export const mockLogs: RequestLog[] = Array.from({ length: 24 }).map((_, i) => {
  const statuses: LogStatus[] = ["allowed", "allowed", "allowed", "blocked_input", "blocked_output", "allowed", "error"];
  const status = statuses[i % statuses.length];
  return {
    id: `log_${i}`,
    apiKeyName: i % 3 === 0 ? "Staging" : "Production",
    provider: i % 3 === 0 ? "openai" : "lovable",
    model: i % 3 === 0 ? "gpt-4o-mini" : "google/gemini-3-flash-preview",
    status,
    blockReason:
      status === "blocked_input"
        ? "Matched blocked keyword: 'password'"
        : status === "blocked_output"
        ? "Output contained restricted term"
        : undefined,
    latencyMs: 240 + Math.floor(Math.random() * 1200),
    tokensIn: 80 + Math.floor(Math.random() * 400),
    tokensOut: 60 + Math.floor(Math.random() * 600),
    createdAt: new Date(Date.now() - i * 1000 * 60 * 37).toISOString(),
    prompt: samplePrompts[i % samplePrompts.length],
    response:
      status === "blocked_input"
        ? "[blocked by AnveGuard policy]"
        : "Here is a concise, helpful answer that the model returned to your application.",
  };
});

export const mockChartData = Array.from({ length: 14 }).map((_, i) => ({
  day: new Date(Date.now() - (13 - i) * 86400000).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
  requests: 120 + Math.floor(Math.random() * 380),
  blocked: Math.floor(Math.random() * 40),
}));

export const globalDefaultBlockedTerms = [
  "ignore previous instructions",
  "system prompt",
  "jailbreak",
  "DAN mode",
  "credit card",
  "ssn",
];
