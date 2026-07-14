import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth/password.js";
import { createMemoryUserRepository } from "../src/auth/users.js";
import { createMemoryConversationRepository } from "../src/conversations/repository.js";
import { createMemoryPromptTemplateRepository } from "../src/prompt-templates/repository.js";

const ALICE_ID = "11111111-1111-1111-1111-111111111111";
const BOB_ID = "22222222-2222-2222-2222-222222222222";
const CONVERSATION_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TEMPLATE_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const BOB_TEMPLATE_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function parseSseEvents(body: string): Array<{ event: string; data: any }> {
  return body
    .split("\n\n")
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      return { event, data: data ? JSON.parse(data) : null };
    });
}

async function createAuthedApp() {
  const users = createMemoryUserRepository([
    {
      id: ALICE_ID,
      email: "alice@example.com",
      passwordHash: await hashPassword("password123"),
      createdAt: new Date("2026-07-13T00:00:00.000Z"),
    },
    {
      id: BOB_ID,
      email: "bob@example.com",
      passwordHash: await hashPassword("password123"),
      createdAt: new Date("2026-07-13T00:00:00.000Z"),
    },
  ]);

  const conversations = createMemoryConversationRepository([
    {
      id: CONVERSATION_ID,
      ownerId: ALICE_ID,
      title: "学习计划",
      createdAt: new Date("2026-07-13T01:00:00.000Z"),
      updatedAt: new Date("2026-07-13T01:00:00.000Z"),
    },
  ]);

  const promptTemplates = createMemoryPromptTemplateRepository([
    {
      id: TEMPLATE_ID,
      ownerId: ALICE_ID,
      name: "问候",
      description: "",
      body: "你好 {{name}}，今天聊 {{topic}}",
      tags: ["greet"],
      createdAt: new Date("2026-07-13T01:00:00.000Z"),
      updatedAt: new Date("2026-07-13T01:00:00.000Z"),
    },
    {
      id: BOB_TEMPLATE_ID,
      ownerId: BOB_ID,
      name: "Bob",
      description: "",
      body: "秘密 {{x}}",
      tags: [],
      createdAt: new Date("2026-07-13T02:00:00.000Z"),
      updatedAt: new Date("2026-07-13T02:00:00.000Z"),
    },
  ]);

  const app = buildApp({
    database: { checkConnection: async () => true },
    users,
    conversations,
    promptTemplates,
  });

  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "alice@example.com", password: "password123" },
  });
  const setCookie = login.headers["set-cookie"];
  const cookieValue = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  const accessToken = cookieValue?.match(/access_token=([^;]+)/)?.[1];

  return { app, cookie: `access_token=${accessToken}` };
}

describe("GET /prompt-templates/:id/variables", () => {
  it("返回模板变量列表", async () => {
    const { app, cookie } = await createAuthedApp();

    const response = await app.inject({
      method: "GET",
      url: `/prompt-templates/${TEMPLATE_ID}/variables`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      variables: ["name", "topic"],
    });

    await app.close();
  });
});

describe("POST /conversations/:id/messages with prompt template", () => {
  it("使用完整变量渲染后发送，并在历史中保存模板来源", async () => {
    const { app, cookie } = await createAuthedApp();

    const stream = await app.inject({
      method: "POST",
      url: `/conversations/${CONVERSATION_ID}/messages`,
      headers: { cookie },
      payload: {
        promptTemplateId: TEMPLATE_ID,
        variables: { name: "Alice", topic: "TDD" },
      },
    });

    expect(stream.statusCode).toBe(200);
    const events = parseSseEvents(stream.body);
    expect(events[0]?.event).toBe("message.user");
    expect(events[0]?.data).toMatchObject({
      content: "你好 Alice，今天聊 TDD",
      promptTemplateId: TEMPLATE_ID,
      status: "completed",
    });

    const history = await app.inject({
      method: "GET",
      url: `/conversations/${CONVERSATION_ID}/messages`,
      headers: { cookie },
    });
    expect(history.statusCode).toBe(200);
    expect(history.json().messages[0]).toMatchObject({
      role: "user",
      content: "你好 Alice，今天聊 TDD",
      promptTemplateId: TEMPLATE_ID,
    });

    await app.close();
  });

  it("缺失变量返回 400 VALIDATION_ERROR", async () => {
    const { app, cookie } = await createAuthedApp();

    const response = await app.inject({
      method: "POST",
      url: `/conversations/${CONVERSATION_ID}/messages`,
      headers: { cookie },
      payload: {
        promptTemplateId: TEMPLATE_ID,
        variables: { name: "Alice" },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: expect.any(String),
        details: [
          {
            field: "variables.topic",
            message: expect.any(String),
          },
        ],
      },
    });

    await app.close();
  });

  it("使用他人模板返回 404", async () => {
    const { app, cookie } = await createAuthedApp();

    const response = await app.inject({
      method: "POST",
      url: `/conversations/${CONVERSATION_ID}/messages`,
      headers: { cookie },
      payload: {
        promptTemplateId: BOB_TEMPLATE_ID,
        variables: { x: "1" },
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
});
