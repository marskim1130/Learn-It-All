import { describe, expect, it, vi } from "vitest";

import { createOpenAICompatibleProvider } from "../src/chat/openai-provider.js";

describe("createOpenAICompatibleProvider", () => {
  it("把上游 OpenAI 兼容 SSE 转成统一 delta 分片", async () => {
    const upstreamBody = [
      'data: {"choices":[{"delta":{"content":"你"}}]}',
      "",
      'data: {"choices":[{"delta":{"content":"好"}}]}',
      "",
      "data: [DONE]",
      "",
    ].join("\n");

    const fetchMock = vi.fn(async () => {
      return new Response(upstreamBody, {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
        },
      });
    });

    const provider = createOpenAICompatibleProvider({
      baseUrl: "https://api.example.com/v1",
      apiKey: "test-key",
      model: "demo-model",
      fetchImpl: fetchMock,
    });

    const deltas: string[] = [];
    for await (const chunk of provider.stream({
      messages: [{ role: "user", content: "你好" }],
    })) {
      deltas.push(chunk.delta);
    }

    expect(deltas).toEqual(["你", "好"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const firstCall = fetchMock.mock.calls.at(0);
    expect(firstCall).toBeTruthy();
    const [url, init] = firstCall as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.com/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      authorization: "Bearer test-key",
      "content-type": "application/json",
    });

    const body = JSON.parse(String(init.body));
    expect(body).toEqual({
      model: "demo-model",
      stream: true,
      messages: [{ role: "user", content: "你好" }],
    });
    expect(JSON.stringify(body)).not.toContain("test-key");
  });

  it("上游非 2xx 时抛出失败错误", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response("upstream error", {
        status: 401,
        headers: {
          "content-type": "application/json",
        },
      });
    });

    const provider = createOpenAICompatibleProvider({
      baseUrl: "https://api.example.com/v1",
      apiKey: "test-key",
      model: "demo-model",
      fetchImpl: fetchMock,
    });

    await expect(async () => {
      for await (const _chunk of provider.stream({
        messages: [{ role: "user", content: "你好" }],
      })) {
        // 不应产出分片
      }
    }).rejects.toThrow(/401/);
  });
});
