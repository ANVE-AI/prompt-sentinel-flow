# Plan: restore dashboard on `guard.citerlabs.com` and expand endpoint presets

## 1. Fix the production CORS failure

The dashboard function currently has strict CORS. It allows Lovable preview/published domains, but not your custom domain:

```text
https://guard.citerlabs.com
```

That is why all these actions fail before auth/data logic even runs:

- `stats`
- `stats&range=14d`
- `list_logs`
- `token_spike_alert`
- `block_spike_alert`
- `list_providers`
- `list_endpoints`
- `list_endpoint_models`

I will update `supabase/functions/_shared/anveguard.ts` to allow Citer Labs domains in `DEFAULT_DASHBOARD_ORIGIN_PATTERNS`:

```ts
/^https:\/\/(?:[a-z0-9-]+\.)*citerlabs\.com$/i,
```

This covers:

- `https://guard.citerlabs.com`
- future subdomains like `app.citerlabs.com` or `staging.citerlabs.com`
- the root `https://citerlabs.com` if used later

I will keep dashboard CORS restricted; I will not switch it back to `*` because dashboard responses are authenticated and should not be exposed to arbitrary origins.

## 2. Redeploy the relevant backend functions

After the CORS patch, I will redeploy:

- `dashboard` — required for the failing dashboard requests
- `proxy` — if needed because it imports the same shared module bundle

## 3. Verify CORS from the custom domain

I will smoke-test the deployed function with a preflight request using:

```text
Origin: https://guard.citerlabs.com
Access-Control-Request-Method: GET
Access-Control-Request-Headers: authorization,content-type,apikey,x-client-info
```

Expected response:

```text
Access-Control-Allow-Origin: https://guard.citerlabs.com
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
```

Then I will verify `list_providers` is reachable, because that endpoint powers the simple endpoint selection UI.

## 4. Add more simple endpoint presets

The app already has a template system in `supabase/functions/_shared/providers.ts`. The simple endpoint flow uses these templates so users can pick a provider, enter an API key, test, and save.

Existing presets already include:

- Lovable AI
- OpenAI
- Google Gemini
- Perplexity
- Ollama
- vLLM / LM Studio / TGI
- Azure OpenAI
- Groq
- Anthropic
- OpenRouter
- Together AI
- Fireworks
- xAI Grok
- Mistral
- DeepSeek
- OpenAI Responses API

I will add additional commonly used OpenAI-compatible providers with base URL/path/auth defaults prefilled:

| Provider | Base URL / Prefix | Auth | Default model |
|---|---|---|---|
| Cohere | `https://api.cohere.ai` + `/compatibility/v1` | Bearer | `command-r-plus` |
| Cerebras | `https://api.cerebras.ai` + `/v1` | Bearer | `llama3.3-70b` |
| SambaNova | `https://api.sambanova.ai` + `/v1` | Bearer | `Meta-Llama-3.3-70B-Instruct` |
| Hyperbolic | `https://api.hyperbolic.xyz` + `/v1` | Bearer | `meta-llama/Meta-Llama-3-70B-Instruct` |
| NVIDIA NIM | `https://integrate.api.nvidia.com` + `/v1` | Bearer | `meta/llama-3.1-70b-instruct` |
| Hugging Face Inference Providers | `https://router.huggingface.co` + `/v1` | Bearer | `meta-llama/Llama-3.1-8B-Instruct` |
| Nebius AI Studio | `https://api.studio.nebius.com` + `/v1` | Bearer | `meta-llama/Meta-Llama-3.1-70B-Instruct` |
| Novita AI | `https://api.novita.ai` + `/v3/openai` | Bearer | `meta-llama/llama-3.1-8b-instruct` |
| Moonshot Kimi | `https://api.moonshot.ai` + `/v1` | Bearer | `kimi-k2-turbo-preview` |
| Alibaba Qwen / DashScope | `https://dashscope-intl.aliyuncs.com` + `/compatible-mode/v1` | Bearer | `qwen-plus` |

For each preset I will include:

- provider label
- short description
- base URL
- path prefix
- `/chat/completions` path
- `/models` path where supported
- bearer auth
- default model
- model suggestions

## 5. Keep the simple flow easy

The current UI already opens simple mode when a provider card is selected and hides advanced configuration. I will keep that pattern and ensure the summary clearly shows the selected provider’s:

- base URL
- auth scheme
- response format
- default model

So the user flow remains:

```text
Pick provider → paste API key → refresh/test models → save
```

## 6. Validation checklist

After implementation I will verify:

1. Dashboard preflight from `https://guard.citerlabs.com` returns the correct CORS headers.
2. `list_providers` is reachable from the custom domain.
3. The new provider presets are returned by the dashboard function.
4. The endpoint gallery shows the expanded list.
5. No database migration is required.
