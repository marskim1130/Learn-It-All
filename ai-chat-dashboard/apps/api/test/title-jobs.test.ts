import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth/password.js";
import { createMemoryUserRepository } from "../src/auth/users.js";
import { createMemoryConversationRepository } from "../src/conversations/repository.js";
import {
  createMemoryTitleQueue,
  generateTitleFromSeed,
  shouldEnqueueTitleJob,
} from "../src/jobs/title-queue.js";
import { processTitleJob } from "../src/jobs/title-worker.js";

const ALICE_ID = "11111111-1111-1111-1111-111111111111";
const CONVERSATION_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

async function createAuthedApp(options?: {
  title?: string;
  titleQueue?: ReturnType<typeof createMemoryTitleQueue>;
}) {
  const users = createMemoryUserRepository([
    {
      id: ALICE_ID,
      email: "alice@example.com",
      passwordHash: await hashPassword("password123"),
      createdAt: new Date("2026-07-13T00:00:00.000Z"),
    },
  ]);

  const conversations = createMemoryConversationRepository([
    {
      id: CONVERSATION_ID,
      ownerId: ALICE_ID,
      title: options?.title ?? "新会话",
      createdAt: new Date("2026-07-13T01:00:00.000Z"),
      updatedAt: new Date("2026-07-13T01:00:00.000Z"),
    },
  ]);

  const titleQueue = options?.titleQueue ?? createMemoryTitleQueue();

  const app = buildApp({
    database: { checkConnection: async () => true },
    users,
    conversations,
    titleQueue,
  });

  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "alice@example.com", password: "password123" },
  });
  const setCookie = login.headers["set-cookie"];
  const cookieValue = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  const accessToken = cookieValue?.match(/access_token=([^;]+)/)?.[1];

  return {
    app,
    cookie: `access_token=${accessToken}`,
    titleQueue,
    conversations,
  };
}

describe("conversation title jobs", () => {
  it("首条消息后入队一次标题任务", async () => {
    const { app, cookie, titleQueue } = await createAuthedApp();

    const response = await app.inject({
      method: "POST",
      url: `/conversations/${CONVERSATION_ID}/messages`,
      headers: { cookie },
      payload: { content: "请帮我复习 TypeScript 泛型" },
    });

    expect(response.statusCode).toBe(200);
    expect(titleQueue.jobs).toEqual([
      {
        conversationId: CONVERSATION_ID,
        ownerId: ALICE_ID,
        seedText: "请帮我复习 TypeScript 泛型",
      },
    ]);

    await app.close();
  });

  it("Worker 消费后更新会话标题", async () => {
    const conversations = createMemoryConversationRepository([
      {
        id: CONVERSATION_ID,
        ownerId: ALICE_ID,
        title: "新会话",
        createdAt: new Date("2026-07-13T01:00:00.000Z"),
        updatedAt: new Date("2026-07-13T01:00:00.000Z"),
      },
    ]);

    const result = await processTitleJob(
      {
        conversationId: CONVERSATION_ID,
        ownerId: ALICE_ID,
        seedText: "请帮我复习 TypeScript 泛型",
      },
      conversations,
    );

    expect(result).toEqual({
      updated: true,
      title: "请帮我复习 TypeScript 泛型",
    });

    const conversation = await conversations.findByIdForOwner(
      CONVERSATION_ID,
      ALICE_ID,
    );
    expect(conversation?.title).toBe("请帮我复习 TypeScript 泛型");
  });

  it("第二条消息不再入队", async () => {
    const { app, cookie, titleQueue } = await createAuthedApp();

    await app.inject({
      method: "POST",
      url: `/conversations/${CONVERSATION_ID}/messages`,
      headers: { cookie },
      payload: { content: "第一条" },
    });
    expect(titleQueue.jobs).toHaveLength(1);

    await app.inject({
      method: "POST",
      url: `/conversations/${CONVERSATION_ID}/messages`,
      headers: { cookie },
      payload: { content: "第二条" },
    });
    expect(titleQueue.jobs).toHaveLength(1);

    await app.close();
  });

  it("标题已非默认时 Worker 不覆盖", async () => {
    const conversations = createMemoryConversationRepository([
      {
        id: CONVERSATION_ID,
        ownerId: ALICE_ID,
        title: "我手改的标题",
        createdAt: new Date("2026-07-13T01:00:00.000Z"),
        updatedAt: new Date("2026-07-13T01:00:00.000Z"),
      },
    ]);

    const result = await processTitleJob(
      {
        conversationId: CONVERSATION_ID,
        ownerId: ALICE_ID,
        seedText: "不应覆盖",
      },
      conversations,
    );

    expect(result).toEqual({ updated: false });
    const conversation = await conversations.findByIdForOwner(
      CONVERSATION_ID,
      ALICE_ID,
    );
    expect(conversation?.title).toBe("我手改的标题");
  });

  it("队列失败不影响消息 SSE 成功", async () => {
    const titleQueue = {
      enqueue: vi.fn(async () => {
        throw new Error("redis down");
      }),
    };

    const { app, cookie } = await createAuthedApp({ titleQueue: titleQueue as any });

    const response = await app.inject({
      method: "POST",
      url: `/conversations/${CONVERSATION_ID}/messages`,
      headers: { cookie },
      payload: { content: "你好" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toMatch(/text\/event-stream/);
    expect(titleQueue.enqueue).toHaveBeenCalled();

    await app.close();
  });

  it("标题生成与入队条件为纯函数", () => {
    expect(generateTitleFromSeed("  a\n\nb  ")).toBe("a b");
    expect(generateTitleFromSeed("x".repeat(40)).length).toBe(30);
    expect(
      shouldEnqueueTitleJob({
        conversationTitle: "新会话",
        userMessageCount: 1,
      }),
    ).toBe(true);
    expect(
      shouldEnqueueTitleJob({
        conversationTitle: "新会话",
        userMessageCount: 2,
      }),
    ).toBe(false);
  });
});
