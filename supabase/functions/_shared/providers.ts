// Single source of truth for upstream LLM providers AnveGuard can proxy to.

export type ProviderKind = "openai_compatible" | "anthropic";

export interface ProviderDef {
  id: string;
  label: string;
  kind: ProviderKind;
  url: string;
  /** If true, no user-provided key is required (server uses LOVABLE_API_KEY). */
  managed?: boolean;
  default_model: string;
  model_suggestions: string[];
  key_placeholder: string;
  get_key_url: string;
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: "lovable",
    label: "Lovable AI (managed)",
    kind: "openai_compatible",
    url: "https://ai.gateway.lovable.dev/v1/chat/completions",
    managed: true,
    default_model: "google/gemini-3-flash-preview",
    model_suggestions: [
      "google/gemini-3-flash-preview",
      "google/gemini-2.5-pro",
      "openai/gpt-5",
      "openai/gpt-5-mini",
    ],
    key_placeholder: "",
    get_key_url: "https://docs.lovable.dev/features/ai",
  },
  {
    id: "openai",
    label: "OpenAI",
    kind: "openai_compatible",
    url: "https://api.openai.com/v1/chat/completions",
    default_model: "gpt-4o-mini",
    model_suggestions: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "o4-mini"],
    key_placeholder: "sk-...",
    get_key_url: "https://platform.openai.com/api-keys",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai_compatible",
    url: "https://openrouter.ai/api/v1/chat/completions",
    default_model: "openrouter/auto",
    model_suggestions: [
      "openrouter/auto",
      "anthropic/claude-3.5-sonnet",
      "openai/gpt-4o-mini",
      "meta-llama/llama-3.1-70b-instruct",
    ],
    key_placeholder: "sk-or-...",
    get_key_url: "https://openrouter.ai/keys",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    kind: "anthropic",
    url: "https://api.anthropic.com/v1/messages",
    default_model: "claude-3-5-sonnet-latest",
    model_suggestions: [
      "claude-3-5-sonnet-latest",
      "claude-3-5-haiku-latest",
      "claude-3-opus-latest",
    ],
    key_placeholder: "sk-ant-...",
    get_key_url: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "kimi",
    label: "Moonshot Kimi",
    kind: "openai_compatible",
    url: "https://api.moonshot.ai/v1/chat/completions",
    default_model: "moonshot-v1-8k",
    model_suggestions: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
    key_placeholder: "sk-...",
    get_key_url: "https://platform.moonshot.ai/console/api-keys",
  },
  {
    id: "qwen",
    label: "Alibaba Qwen (DashScope)",
    kind: "openai_compatible",
    url: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
    default_model: "qwen-plus",
    model_suggestions: ["qwen-plus", "qwen-turbo", "qwen-max"],
    key_placeholder: "sk-...",
    get_key_url: "https://dashscope.console.aliyun.com/apiKey",
  },
];

export function getProvider(id: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
