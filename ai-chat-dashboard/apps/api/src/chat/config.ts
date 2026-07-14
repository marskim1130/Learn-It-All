import { createOpenAICompatibleProvider } from "./openai-provider.js";
import {
  createEchoChatModelProvider,
  type ChatModelProvider,
} from "./provider.js";

/**
 * 根据环境变量选择聊天模型提供商。
 * 默认 `echo`，保证 CI 与无密钥本地环境不访问外部模型。
 *
 * @example
 * const provider = resolveChatModelProvider(process.env);
 */
export function resolveChatModelProvider(
  environment: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): ChatModelProvider {
  const providerName = (environment.CHAT_PROVIDER ?? "echo").trim().toLowerCase();

  if (providerName === "echo") {
    return createEchoChatModelProvider();
  }

  if (providerName === "openai") {
    const baseUrl = environment.OPENAI_BASE_URL?.trim();
    const apiKey = environment.OPENAI_API_KEY?.trim();
    const model = environment.OPENAI_MODEL?.trim();

    if (!baseUrl) {
      throw new Error("OPENAI_BASE_URL is required when CHAT_PROVIDER=openai");
    }
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is required when CHAT_PROVIDER=openai");
    }
    if (!model) {
      throw new Error("OPENAI_MODEL is required when CHAT_PROVIDER=openai");
    }

    return createOpenAICompatibleProvider({
      baseUrl,
      apiKey,
      model,
    });
  }

  throw new Error(`Unsupported CHAT_PROVIDER: ${providerName}`);
}
