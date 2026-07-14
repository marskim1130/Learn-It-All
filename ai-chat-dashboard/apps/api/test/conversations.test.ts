import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth/password.js";
import { createMemoryUserRepository } from "../src/auth/users.js";
import {
  createMemoryConversationRepository,
  type ConversationRepository,
} from "../src/conversations/repository.js";

const ALICE_ID = "11111111-1111-1111-1111-111111111111";
const BOB_ID = "22222222-2222-2222-2222-222222222222";

async function createAuthedApp(options?: {
  conversations?: ConversationRepository;
  includeBob?: boolean;
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

  const app = buildApp({
    database: {
      checkConnection: async () => true,
    },
    users,
    ...(options?.conversations ? { conversations: options.conversations } : {}),
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
    loginAsBob: () => login("bob@example.com"),
  };
}

describe("POST /conversations", () => {
  it("登录用户可创建会话并返回会话信息", async () => {
    const { app, loginAsAlice } = await createAuthedApp();
    const cookie = await loginAsAlice();

    const response = await app.inject({
      method: "POST",
      url: "/conversations",
      headers: { cookie },
      payload: {
        title: "学习计划",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      conversation: {
        id: expect.any(String),
        title: "学习计划",
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    });

    await app.close();
  });

  it("未登录创建返回 401 UNAUTHORIZED", async () => {
    const app = buildApp({
      database: {
        checkConnection: async () => true,
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/conversations",
      payload: {
        title: "学习计划",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: expect.any(String),
      },
    });

    await app.close();
  });
});

describe("GET /conversations", () => {
  it("列表只返回当前用户创建的会话", async () => {
    const conversations = createMemoryConversationRepository([
      {
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        ownerId: ALICE_ID,
        title: "Alice 的会话",
        createdAt: new Date("2026-07-13T01:00:00.000Z"),
        updatedAt: new Date("2026-07-13T01:00:00.000Z"),
      },
      {
        id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        ownerId: BOB_ID,
        title: "Bob 的会话",
        createdAt: new Date("2026-07-13T02:00:00.000Z"),
        updatedAt: new Date("2026-07-13T02:00:00.000Z"),
      },
    ]);

    const { app, loginAsAlice } = await createAuthedApp({
      conversations,
      includeBob: true,
    });
    const cookie = await loginAsAlice();

    const response = await app.inject({
      method: "GET",
      url: "/conversations",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      conversations: [
        {
          id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          title: "Alice 的会话",
          createdAt: "2026-07-13T01:00:00.000Z",
          updatedAt: "2026-07-13T01:00:00.000Z",
        },
      ],
    });

    await app.close();
  });
});

describe("GET /conversations/:id", () => {
  it("可读取自己的会话详情", async () => {
    const conversations = createMemoryConversationRepository([
      {
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        ownerId: ALICE_ID,
        title: "Alice 的会话",
        createdAt: new Date("2026-07-13T01:00:00.000Z"),
        updatedAt: new Date("2026-07-13T01:00:00.000Z"),
      },
    ]);

    const { app, loginAsAlice } = await createAuthedApp({ conversations });
    const cookie = await loginAsAlice();

    const response = await app.inject({
      method: "GET",
      url: "/conversations/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      conversation: {
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        title: "Alice 的会话",
        createdAt: "2026-07-13T01:00:00.000Z",
        updatedAt: "2026-07-13T01:00:00.000Z",
      },
    });

    await app.close();
  });

  it("读取他人会话返回 404 NOT_FOUND", async () => {
    const conversations = createMemoryConversationRepository([
      {
        id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        ownerId: BOB_ID,
        title: "Bob 的会话",
        createdAt: new Date("2026-07-13T02:00:00.000Z"),
        updatedAt: new Date("2026-07-13T02:00:00.000Z"),
      },
    ]);

    const { app, loginAsAlice } = await createAuthedApp({
      conversations,
      includeBob: true,
    });
    const cookie = await loginAsAlice();

    const response = await app.inject({
      method: "GET",
      url: "/conversations/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      headers: { cookie },
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
