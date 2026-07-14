/**
 * 模型流式分片。业务层只依赖此抽象，不绑定具体厂商。
 */
export interface ChatModelChunk {
  delta: string;
}

export interface ChatModelRequest {
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  signal?: AbortSignal;
}

/**
 * 聊天模型提供商 [Chat Model Provider]。
 */
export interface ChatModelProvider {
  stream(request: ChatModelRequest): AsyncIterable<ChatModelChunk>;
}

/**
 * 确定性假提供商 [Fake Provider]：把最后一条用户消息按字切分回显。
 *
 * @example
 * const provider = createEchoChatModelProvider();
 * for await (const chunk of provider.stream({
 *   messages: [{ role: "user", content: "你好" }],
 * })) {
 *   console.log(chunk.delta);
 * }
 */
export function createEchoChatModelProvider(): ChatModelProvider {
  return {
    async *stream(request) {
      const lastUser = [...request.messages]
        .reverse()
        .find((item) => item.role === "user");
      const text = lastUser?.content ?? "";

      for (const char of [...text]) {
        if (request.signal?.aborted) {
          return;
        }
        yield { delta: char };
      }
    },
  };
}
