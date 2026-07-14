import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth/password.js";
import { createMemoryUserRepository } from "../src/auth/users.js";
import {
  createMemoryPromptTemplateRepository,
  type PromptTemplateRepository,
} from "../src/prompt-templates/repository.js";

const ALICE_ID = "11111111-1111-1111-1111-111111111111";
const BOB_ID = "22222222-2222-2222-2222-222222222222";
const ALICE_TEMPLATE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const BOB_TEMPLATE_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

async function createAuthedApp(options?: {
  promptTemplates?: PromptTemplateRepository;
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
    ...(options?.promptTemplates
      ? { promptTemplates: options.promptTemplates }
      : {}),
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

describe("POST /prompt-templates", () => {
  it("登录用户可创建模板并返回公开字段", async () => {
    const { app, loginAsAlice } = await createAuthedApp();
    const cookie = await loginAsAlice();

    const response = await app.inject({
      method: "POST",
      url: "/prompt-templates",
      headers: { cookie },
      payload: {
        name: "代码审查",
        description: "审查 PR",
        body: "请审查以下代码并给出建议",
        tags: ["code", "review"],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      promptTemplate: {
        id: expect.any(String),
        name: "代码审查",
        description: "审查 PR",
        body: "请审查以下代码并给出建议",
        tags: ["code", "review"],
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    });

    await app.close();
  });

  it("空名称返回 400 VALIDATION_ERROR", async () => {
    const { app, loginAsAlice } = await createAuthedApp();
    const cookie = await loginAsAlice();

    const response = await app.inject({
      method: "POST",
      url: "/prompt-templates",
      headers: { cookie },
      payload: {
        name: "   ",
        body: "正文",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: expect.any(String),
        details: [{ field: "name", message: expect.any(String) }],
      },
    });

    await app.close();
  });
});

describe("GET /prompt-templates", () => {
  it("列表只返回当前用户模板，并支持 q 筛选", async () => {
    const promptTemplates = createMemoryPromptTemplateRepository([
      {
        id: ALICE_TEMPLATE_ID,
        ownerId: ALICE_ID,
        name: "代码审查",
        description: "审查 PR",
        body: "请审查代码",
        tags: ["code"],
        createdAt: new Date("2026-07-13T01:00:00.000Z"),
        updatedAt: new Date("2026-07-13T01:00:00.000Z"),
      },
      {
        id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        ownerId: ALICE_ID,
        name: "翻译助手",
        description: "英译中",
        body: "请翻译",
        tags: ["translate"],
        createdAt: new Date("2026-07-13T01:30:00.000Z"),
        updatedAt: new Date("2026-07-13T01:30:00.000Z"),
      },
      {
        id: BOB_TEMPLATE_ID,
        ownerId: BOB_ID,
        name: "Bob 的模板",
        description: "私有",
        body: "秘密",
        tags: ["private"],
        createdAt: new Date("2026-07-13T02:00:00.000Z"),
        updatedAt: new Date("2026-07-13T02:00:00.000Z"),
      },
    ]);

    const { app, loginAsAlice } = await createAuthedApp({
      promptTemplates,
      includeBob: true,
    });
    const cookie = await loginAsAlice();

    const all = await app.inject({
      method: "GET",
      url: "/prompt-templates",
      headers: { cookie },
    });
    expect(all.statusCode).toBe(200);
    expect(all.json().promptTemplates).toHaveLength(2);
    expect(
      all.json().promptTemplates.every(
        (item: { id: string }) => item.id !== BOB_TEMPLATE_ID,
      ),
    ).toBe(true);

    const filtered = await app.inject({
      method: "GET",
      url: "/prompt-templates?q=代码",
      headers: { cookie },
    });
    expect(filtered.statusCode).toBe(200);
    expect(filtered.json()).toEqual({
      promptTemplates: [
        {
          id: ALICE_TEMPLATE_ID,
          name: "代码审查",
          description: "审查 PR",
          body: "请审查代码",
          tags: ["code"],
          createdAt: "2026-07-13T01:00:00.000Z",
          updatedAt: "2026-07-13T01:00:00.000Z",
        },
      ],
    });

    await app.close();
  });
});

describe("PATCH /prompt-templates/:id", () => {
  it("可更新自己的模板", async () => {
    const promptTemplates = createMemoryPromptTemplateRepository([
      {
        id: ALICE_TEMPLATE_ID,
        ownerId: ALICE_ID,
        name: "旧名称",
        description: "旧描述",
        body: "旧正文",
        tags: ["old"],
        createdAt: new Date("2026-07-13T01:00:00.000Z"),
        updatedAt: new Date("2026-07-13T01:00:00.000Z"),
      },
    ]);

    const { app, loginAsAlice } = await createAuthedApp({ promptTemplates });
    const cookie = await loginAsAlice();

    const response = await app.inject({
      method: "PATCH",
      url: `/prompt-templates/${ALICE_TEMPLATE_ID}`,
      headers: { cookie },
      payload: {
        name: "新名称",
        body: "新正文",
        tags: ["new"],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().promptTemplate).toMatchObject({
      id: ALICE_TEMPLATE_ID,
      name: "新名称",
      body: "新正文",
      tags: ["new"],
    });

    await app.close();
  });

  it("更新他人模板返回 404", async () => {
    const promptTemplates = createMemoryPromptTemplateRepository([
      {
        id: BOB_TEMPLATE_ID,
        ownerId: BOB_ID,
        name: "Bob",
        description: "",
        body: "秘密",
        tags: [],
        createdAt: new Date("2026-07-13T02:00:00.000Z"),
        updatedAt: new Date("2026-07-13T02:00:00.000Z"),
      },
    ]);

    const { app, loginAsAlice } = await createAuthedApp({
      promptTemplates,
      includeBob: true,
    });
    const cookie = await loginAsAlice();

    const response = await app.inject({
      method: "PATCH",
      url: `/prompt-templates/${BOB_TEMPLATE_ID}`,
      headers: { cookie },
      payload: { name: "劫持" },
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

describe("DELETE /prompt-templates/:id", () => {
  it("可删除自己的模板", async () => {
    const promptTemplates = createMemoryPromptTemplateRepository([
      {
        id: ALICE_TEMPLATE_ID,
        ownerId: ALICE_ID,
        name: "待删除",
        description: "",
        body: "正文",
        tags: [],
        createdAt: new Date("2026-07-13T01:00:00.000Z"),
        updatedAt: new Date("2026-07-13T01:00:00.000Z"),
      },
    ]);

    const { app, loginAsAlice } = await createAuthedApp({ promptTemplates });
    const cookie = await loginAsAlice();

    const response = await app.inject({
      method: "DELETE",
      url: `/prompt-templates/${ALICE_TEMPLATE_ID}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(204);

    const list = await app.inject({
      method: "GET",
      url: "/prompt-templates",
      headers: { cookie },
    });
    expect(list.json()).toEqual({ promptTemplates: [] });

    await app.close();
  });
});
