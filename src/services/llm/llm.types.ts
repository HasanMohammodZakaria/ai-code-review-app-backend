export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmRequest {
  messages: ChatMessage[];
  temperature?: number;
  jsonMode?: boolean; // ask the model for a JSON object
}

export interface LlmResponse {
  text: string;
  provider: string;
  model: string;
}

export interface LlmProvider {
  name: string;
  model: string;
  complete(request: LlmRequest): Promise<LlmResponse>;
}

// Thrown by a provider; the manager uses `kind` to choose the cooldown
export type LlmFailureKind =
  | "rate_limit"
  | "server"
  | "auth"
  | "timeout"
  | "bad_response";

export class LlmProviderError extends Error {
  constructor(
    public readonly provider: string,
    public readonly kind: LlmFailureKind,
    message: string,
  ) {
    super(message);
  }
}

export class AllProvidersFailedError extends Error {
  constructor(
    public readonly failures: { provider: string; reason: string }[],
  ) {
    super("All LLM providers failed or are unavailable");
  }
}
