import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth/password.js";
import { createMemoryUserRepository } from "../src/auth/users.js";
import type { ChatModelProvider } from "../src/chat/provider.js";
import { createMemoryConversationRepository } from "../src/conversations/repository.js";

const ALICE_ID = "11111111-1111-1111-1111-111111111111";
const BOB_ID = "22222222-2222-2222-2222-222222222222";
const CONVERSATION_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const BOB_CONVERSATION_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function parseSseEvents(body: string): Array<{ event: string; data: unknown }> {
  const events: Array<{ event: string; data: unknown }> = [];
  const blocks = body
    .split("\n\n")
    .map((block) => block.trim())
    .filter(Boolean);

  for (const block of blocks) {
    const lines = block.split("\n");
    let event = "message";
    let data = "";
    for (const line of lines) {
      if (line.startsWith("event:")) {
        event = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        data += line.slice("data:".length).trim();
      }
    }
    events.push({
      event,
      data: data ? JSON.parse(data) : null,
    });
  }

  return events;
}

async function createAuthedApp(options?: {
  includeBob?: boolean;
  chatModel?: ChatModelProvider;
}) {
  const users = createMemoryUserRepository([
    {
      id: ALICE_ID,
      email: "alice@example.com",
      passwordHash: await hashPassword("password123"),
      createdAt: new Date("2026-07-13T00:00:00.000Z"),
    },
    ...(options?.includeBob
      ? [
          {
            id: BOB_ID,
            email: "bob@example.com",
            passwordHash: await hashPassword("password123"),
            createdAt: new Date("2026-07-13T00:00:00.000Z"),
          },
        ]
      : []),
  ]);

  const conversations = createMemoryConversationRepository([
    {
      id: CONVERSATION_ID,
      ownerId: ALICE_ID,
      title: "学习计划",
      createdAt: new Date("2026-07-13T01:00:00.000Z"),
      updatedAt: new Date("2026-07-13T01:00:00.000Z"),
    },
    ...(options?.includeBob
      ? [
          {
            id: BOB_CONVERSATION_ID,
            ownerId: BOB_ID,
            title: "Bob 的会话",
            createdAt: new Date("2026-07-13T02:00:00.000Z"),
            updatedAt: new Date("2026-07-13T02:00:00.000Z"),
          },
        ]
      : []),
  ]);

  const app = buildApp({
    database: {
      checkConnection: async () => true,
    },
    users,
    conversations,
    ...(options?.chatModel ? { chatModel: options.chatModel } : {}),
  });

  async function login(email: string) {
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email,
        password: "password123",
      },
    });
    const setCookie = response.headers["set-cookie"];
    const cookieValue = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    const accessToken = cookieValue?.match(/access_token=([^;]+)/)?.[1];
    return `access_token=${accessToken}`;
  }

  return {
    app,
    loginAsAlice: () => login("alice@example.com"),
  };
}

describe("POST /conversations/:id/messages", () => {
  it("发送消息时先持久化用户消息，再按序返回 SSE 分片与完成事件", async () => {
    const { app, loginAsAlice } = await createAuthedApp();
    const cookie = await loginAsAlice();

    const response = await app.inject({
      method: "POST",
      url: `/conversations/${CONVERSATION_ID}/messages`,
      headers: { cookie },
      payload: {
        content: "你好",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toMatch(/text\/event-stream/);

    const events = parseSseEvents(response.body);
    expect(events.map((item) => item.event)).toEqual([
      "message.user",
      "message.assistant.started",
      "message.assistant.delta",
      "message.assistant.delta",
      "message.assistant.completed",
    ]);

    expect(events[0]?.data).toEqual({
      id: expect.any(String),
      role: "user",
      content: "你好",
      status: "completed",
      createdAt: expect.any(String),
    });

    expect(events[1]?.data).toEqual({
      id: expect.any(String),
      role: "assistant",
      content: "",
      status: "generating",
      createdAt: expect.any(String),
    });

    expect(events[2]?.data).toEqual({
      id: expect.any(String),
      delta: "你",
    });
    expect(events[3]?.data).toEqual({
      id: expect.any(String),
      delta: "好",
    });

    expect(events[4]?.data).toEqual({
      id: expect.any(String),
      role: "assistant",
      content: "你好",
      status: "completed",
      createdAt: expect.any(String),
    });

    await app.close();
  });

  it("流结束后历史消息包含已完成的用户与助手消息", async () => {
    const { app, loginAsAlice } = await createAuthedApp();
    const cookie = await loginAsAlice();

    const stream = await app.inject({
      method: "POST",
      url: `/conversations/${CONVERSATION_ID}/messages`,
      headers: { cookie },
      payload: {
        content: "你好",
      },
    });
    expect(stream.statusCode).toBe(200);

    const response = await app.inject({
      method: "GET",
      url: `/conversations/${CONVERSATION_ID}/messages`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      messages: [
        {
          id: expect.any(String),
          role: "user",
          content: "你好",
          status: "completed",
          createdAt: expect.any(String),
        },
        {
          id: expect.any(String),
          role: "assistant",
          content: "你好",
          status: "completed",
          createdAt: expect.any(String),
        },
      ],
    });

    await app.close();
  });

  it("空 content 返回 400 VALIDATION_ERROR", async () => {
    const { app, loginAsAlice } = await createAuthedApp();
    const cookie = await loginAsAlice();

    const response = await app.inject({
      method: "POST",
      url: `/conversations/${CONVERSATION_ID}/messages`,
      headers: { cookie },
      payload: {
        content: "   ",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: expect.any(String),
        details: [
          {
            field: "content",
            message: expect.any(String),
          },
        ],
      },
    });

    await app.close();
  });

  it("向他人会话发送消息返回 404 NOT_FOUND", async () => {
    const { app, loginAsAlice } = await createAuthedApp({ includeBob: true });
    const cookie = await loginAsAlice();

    const response = await app.inject({
      method: "POST",
      url: `/conversations/${BOB_CONVERSATION_ID}/messages`,
      headers: { cookie },
      payload: {
        content: "你好",
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: expect.any(String),
      },
    });

    await app.close();
  });

  it("假提供商失败时返回 failed 事件且助手消息状态为 failed", async () => {
    const failingProvider: ChatModelProvider = {
      async *stream() {
        yield { delta: "半" };
        throw new Error("upstream failed");
      },
    };

    const { app, loginAsAlice } = await createAuthedApp({
      chatModel: failingProvider,
    });
    const cookie = await loginAsAlice();

    const response = await app.inject({
      method: "POST",
      url: `/conversations/${CONVERSATION_ID}/messages`,
      headers: { cookie },
      payload: {
        content: "你好",
      },
    });

    expect(response.statusCode).toBe(200);
    const events = parseSseEvents(response.body);
    expect(events.map((item) => item.event)).toEqual([
      "message.user",
      "message.assistant.started",
      "message.assistant.delta",
      "message.assistant.failed",
    ]);
    expect(events[3]?.data).toEqual({
      id: expect.any(String),
      role: "assistant",
      content: "半",
      status: "failed",
      createdAt: expect.any(String),
      message: expect.any(String),
    });

    const history = await app.inject({
      method: "GET",
      url: `/conversations/${CONVERSATION_ID}/messages`,
      headers: { cookie },
    });
    expect(history.statusCode).toBe(200);
    expect(history.json().messages).toEqual([
      {
        id: expect.any(String),
        role: "user",
        content: "你好",
        status: "completed",
        createdAt: expect.any(String),
      },
      {
        id: expect.any(String),
        role: "assistant",
        content: "半",
        status: "failed",
        createdAt: expect.any(String),
      },
    ]);

    await app.close();
  });

  it("流中断时助手消息标记为 failed 而不是 generating", async () => {
    const abortedProvider: ChatModelProvider = {
      async *stream() {
        yield { delta: "中" };
        const error = new Error("The operation was aborted");
        error.name = "AbortError";
        throw error;
      },
    };

    const { app, loginAsAlice } = await createAuthedApp({
      chatModel: abortedProvider,
    });
    const cookie = await loginAsAlice();

    const response = await app.inject({
      method: "POST",
      url: `/conversations/${CONVERSATION_ID}/messages`,
      headers: { cookie },
      payload: {
        content: "你好",
      },
    });

    expect(response.statusCode).toBe(200);
    const events = parseSseEvents(response.body);
    expect(events.at(-1)?.event).toBe("message.assistant.failed");
    expect(events.at(-1)?.data).toMatchObject({
      status: "failed",
      content: "中",
    });

    const history = await app.inject({
      method: "GET",
      url: `/conversations/${CONVERSATION_ID}/messages`,
      headers: { cookie },
    });
    const assistant = history.json().messages.find(
      (item: { role: string }) => item.role === "assistant",
    );
    expect(assistant?.status).toBe("failed");

    await app.close();
  });
});
