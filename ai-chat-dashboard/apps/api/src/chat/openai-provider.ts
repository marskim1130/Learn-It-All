import type { ChatModelProvider, ChatModelRequest } from "./provider.js";

export interface OpenAICompatibleProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
}

/**
 * 创建 OpenAI 兼容聊天提供商 [OpenAI-Compatible Provider]。
 * 仅依赖 HTTP `/chat/completions` 流式协议，不引入官方 SDK。
 *
 * @example
 * const provider = createOpenAICompatibleProvider({
 *   baseUrl: "https://api.openai.com/v1",
 *   apiKey: process.env.OPENAI_API_KEY!,
 *   model: "gpt-4o-mini",
 * });
 */
export function createOpenAICompatibleProvider(
  config: OpenAICompatibleProviderConfig,
): ChatModelProvider {
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  const fetchImpl = config.fetchImpl ?? fetch;

  return {
    async *stream(request: ChatModelRequest) {
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: config.model,
          stream: true,
          messages: request.messages,
        }),
        ...(request.signal ? { signal: request.signal } : {}),
      });

      if (!response.ok) {
        throw new Error(`OpenAI compatible provider failed with status ${response.status}`);
      }

      if (!response.body) {
        throw new Error("OpenAI compatible provider returned an empty body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          if (request.signal?.aborted) {
            await reader.cancel();
            return;
          }

          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line.startsWith("data:")) {
              continue;
            }

            const data = line.slice("data:".length).trim();
            if (!data || data === "[DONE]") {
              continue;
            }

            let parsed: {
              choices?: Array<{ delta?: { content?: string | null } }>;
            };
            try {
              parsed = JSON.parse(data) as {
                choices?: Array<{ delta?: { content?: string | null } }>;
              };
            } catch {
              continue;
            }

            const delta = parsed.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta.length > 0) {
              yield { delta };
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    },
  };
}
