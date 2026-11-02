import {
  LlmProviderError,
  type LlmProvider,
  type LlmRequest,
  type LlmResponse,
} from "../llm.types";

interface Options {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
}

interface ChatCompletion {
  choices?: { message?: { content?: string } }[];
}

export class OpenAICompatibleProvider implements LlmProvider {
  readonly name: string;
  readonly model: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(options: Options) {
    this.name = options.name;
    this.model = options.model;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: request.messages,
          temperature: request.temperature ?? 0.2,
          ...(request.jsonMode
            ? { response_format: { type: "json_object" } }
            : {}),
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      const cause = (error as { cause?: { code?: string; message?: string } })
        .cause;
      const detail = cause?.code ?? cause?.message ?? "";
      throw new LlmProviderError(
        this.name,
        timedOut ? "timeout" : "server",
        timedOut ? "Request timed out" : `Network error ${detail}`.trim(),
      );
    }

    if (!response.ok) {
      const kind =
        response.status === 429
          ? "rate_limit"
          : response.status === 401 || response.status === 403
            ? "auth"
            : "server";

      // Keep a short snippet of the provider's message for debugging
      const body = await response.text().catch(() => "");
      const detail = body.slice(0, 200).replace(/\s+/g, " ");
      throw new LlmProviderError(
        this.name,
        kind,
        `HTTP ${response.status} ${detail}`,
      );
    }

    // Read as text first: some endpoints answer with plain text instead of JSON
    const raw = await response.text();
    let json: ChatCompletion;
    try {
      json = JSON.parse(raw) as ChatCompletion;
    } catch {
      const snippet = raw.slice(0, 80).replace(/\s+/g, " ");
      throw new LlmProviderError(
        this.name,
        "bad_response",
        `Not JSON (HTTP ${response.status}): "${snippet}"`,
      );
    }

    const text = json.choices?.[0]?.message?.content;
    if (!text)
      throw new LlmProviderError(this.name, "bad_response", "Empty response");

    return { text, provider: this.name, model: this.model };
  }
}
