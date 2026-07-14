import { describe, expect, it, vi } from "vitest";

import { resolveChatModelProvider } from "../src/chat/config.js";

describe("resolveChatModelProvider", () => {
  it("默认使用 echo 假提供商并本地回显", async () => {
    const provider = resolveChatModelProvider({});
    const deltas: string[] = [];

    for await (const chunk of provider.stream({
      messages: [{ role: "user", content: "你好" }],
    })) {
      deltas.push(chunk.delta);
    }

    expect(deltas).toEqual(["你", "好"]);
  });

  it("CHAT_PROVIDER=openai 时使用兼容接口请求上游", async () => {
    const upstreamBody = [
      'data: {"choices":[{"delta":{"content":"Hi"}}]}',
      "",
      "data: [DONE]",
      "",
    ].join("\n");

    const fetchMock = vi.fn(async () => {
      return new Response(upstreamBody, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      const provider = resolveChatModelProvider({
        CHAT_PROVIDER: "openai",
        OPENAI_BASE_URL: "https://api.example.com/v1",
        OPENAI_API_KEY: "secret-key",
        OPENAI_MODEL: "demo-model",
      });

      const deltas: string[] = [];
      for await (const chunk of provider.stream({
        messages: [{ role: "user", content: "你好" }],
      })) {
        deltas.push(chunk.delta);
      }

      expect(deltas).toEqual(["Hi"]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const firstCall = fetchMock.mock.calls.at(0) as unknown as [string, RequestInit];
      expect(firstCall[0]).toBe("https://api.example.com/v1/chat/completions");
      expect(firstCall[1].headers).toMatchObject({
        authorization: "Bearer secret-key",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("选择 openai 但缺少 API Key 时抛出明确错误", () => {
    expect(() =>
      resolveChatModelProvider({
        CHAT_PROVIDER: "openai",
        OPENAI_BASE_URL: "https://api.example.com/v1",
        OPENAI_MODEL: "demo-model",
      }),
    ).toThrow(/OPENAI_API_KEY/);
  });
});
