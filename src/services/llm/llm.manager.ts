import { env } from "../../config/env";
import { OpenAICompatibleProvider } from "./providers/openai-compatible.provider";
import {
  AllProvidersFailedError,
  LlmProviderError,
  type LlmFailureKind,
  type LlmProvider,
  type LlmRequest,
  type LlmResponse,
} from "./llm.types";

const MINUTE = 60_000;
const COOLDOWN_MS: Record<LlmFailureKind, number> = {
  rate_limit: 10 * MINUTE,
  server: 1 * MINUTE,
  timeout: 1 * MINUTE,
  bad_response: 1 * MINUTE,
  auth: 60 * MINUTE, // wrong key: do not retry soon
};

interface ProviderConfig {
  name: string;
  baseUrl: string;
  apiKey?: string;
  model: string;
}

// Order = priority = fallback order
const CONFIGS: ProviderConfig[] = [
  {
    name: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_MODEL,
  },
  {
    name: "groq",
    baseUrl: "https://api.groq.com/openai/v1",
    apiKey: env.GROQ_API_KEY,
    model: env.GROQ_MODEL,
  },
  {
    name: "cloudflare",
    baseUrl: `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID ?? ""}/ai/v1`,
    // needs BOTH the account id and the token; otherwise the provider is skipped
    apiKey: env.CLOUDFLARE_ACCOUNT_ID ? env.CLOUDFLARE_API_TOKEN : undefined,
    model: env.CLOUDFLARE_MODEL,
  },
  {
    name: "github",
    baseUrl: "https://models.github.ai/inference",
    apiKey: env.GITHUB_MODELS_TOKEN,
    model: env.GITHUB_MODEL,
  },
];

// Providers without a key are skipped
const providers: LlmProvider[] = CONFIGS.filter((c) => c.apiKey).map(
  (c) =>
    new OpenAICompatibleProvider({
      name: c.name,
      baseUrl: c.baseUrl,
      apiKey: c.apiKey as string,
      model: c.model,
    }),
);

const cooldownUntil = new Map<string, number>();

export function configuredProviders(): string[] {
  return providers.map((p) => p.name);
}

export async function completeWithFallback(
  request: LlmRequest,
): Promise<LlmResponse> {
  const failures: { provider: string; reason: string }[] = [];
  const now = Date.now();

  for (const provider of providers) {
    const until = cooldownUntil.get(provider.name) ?? 0;
    if (until > now) {
      failures.push({ provider: provider.name, reason: "cooling down" });
      continue;
    }

    try {
      return await provider.complete(request);
    } catch (error) {
      const kind: LlmFailureKind =
        error instanceof LlmProviderError ? error.kind : "server";
      const reason = error instanceof Error ? error.message : "Unknown error";

      cooldownUntil.set(provider.name, Date.now() + COOLDOWN_MS[kind]);
      failures.push({ provider: provider.name, reason: `${kind}: ${reason}` });
      console.warn(`⚠️ LLM ${provider.name} failed (${kind}): ${reason}`);
    }
  }

  throw new AllProvidersFailedError(failures);
}
