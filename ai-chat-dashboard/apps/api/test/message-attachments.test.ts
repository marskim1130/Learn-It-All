import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth/password.js";
import { createMemoryUserRepository } from "../src/auth/users.js";
import { createMemoryConversationRepository } from "../src/conversations/repository.js";

const ALICE_ID = "11111111-1111-1111-1111-111111111111";
const CONVERSATION_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

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

function buildMultipart(parts: Array<{ name: string; value: string; fileName?: string; contentType?: string }>) {
  const boundary = "----TestBoundary7MA4YWxkTrZu0gW";
  const chunks: string[] = [];
  for (const part of parts) {
    chunks.push(`--${boundary}`);
    if (part.fileName) {
      chunks.push(
        `Content-Disposition: form-data; name="${part.name}"; filename="${part.fileName}"`,
      );
      chunks.push(`Content-Type: ${part.contentType ?? "application/octet-stream"}`);
    } else {
      chunks.push(`Content-Disposition: form-data; name="${part.name}"`);
    }
    chunks.push("");
    chunks.push(part.value);
  }
  chunks.push(`--${boundary}--`);
  chunks.push("");
  return {
    boundary,
    body: chunks.join("\r\n"),
  };
}

async function createAuthedApp() {
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
      title: "附件会话",
      createdAt: new Date("2026-07-13T01:00:00.000Z"),
      updatedAt: new Date("2026-07-13T01:00:00.000Z"),
    },
  ]);

  const app = buildApp({
    database: { checkConnection: async () => true },
    users,
    conversations,
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

describe("POST /conversations/:id/messages with attachment", () => {
  it("合法 Markdown 附件发送成功，用户消息含文件内容与元数据", async () => {
    const { app, cookie } = await createAuthedApp();
    const multipart = buildMultipart([
      { name: "content", value: "请阅读附件" },
      {
        name: "file",
        value: "# 标题\n附件正文",
        fileName: "notes.md",
        contentType: "text/markdown",
      },
    ]);

    const response = await app.inject({
      method: "POST",
      url: `/conversations/${CONVERSATION_ID}/messages`,
      headers: {
        cookie,
        "content-type": `multipart/form-data; boundary=${multipart.boundary}`,
      },
      payload: multipart.body,
    });

    expect(response.statusCode).toBe(200);
    const events = parseSseEvents(response.body);
    expect(events[0]?.event).toBe("message.user");
    expect(events[0]?.data.content).toContain("请阅读附件");
    expect(events[0]?.data.content).toContain("附件: notes.md");
    expect(events[0]?.data.content).toContain("# 标题");
    expect(events[0]?.data.attachment).toEqual({
      fileName: "notes.md",
      mimeType: "text/markdown",
      sizeBytes: expect.any(Number),
    });
    // 只暴露元数据，不泄露本地存储路径字段
    expect(events[0]?.data.attachment).not.toHaveProperty("path");
    expect(events[0]?.data.attachment).not.toHaveProperty("storagePath");
    expect(JSON.stringify(events[0]?.data.attachment)).not.toMatch(
      /storage\/|uploads\//,
    );

    const history = await app.inject({
      method: "GET",
      url: `/conversations/${CONVERSATION_ID}/messages`,
      headers: { cookie },
    });
    expect(history.statusCode).toBe(200);
    expect(history.json().messages[0].attachment).toEqual({
      fileName: "notes.md",
      mimeType: "text/markdown",
      sizeBytes: expect.any(Number),
    });

    await app.close();
  });

  it("超过 1MB 的附件被拒绝", async () => {
    const { app, cookie } = await createAuthedApp();
    const big = "a".repeat(1 * 1024 * 1024 + 1);
    const multipart = buildMultipart([
      {
        name: "file",
        value: big,
        fileName: "big.txt",
        contentType: "text/plain",
      },
    ]);

    const response = await app.inject({
      method: "POST",
      url: `/conversations/${CONVERSATION_ID}/messages`,
      headers: {
        cookie,
        "content-type": `multipart/form-data; boundary=${multipart.boundary}`,
      },
      payload: multipart.body,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: expect.any(String),
        details: [{ field: "file", message: expect.any(String) }],
      },
    });

    await app.close();
  });

  it("非法类型附件被拒绝", async () => {
    const { app, cookie } = await createAuthedApp();
    const multipart = buildMultipart([
      {
        name: "file",
        value: "not-allowed",
        fileName: "photo.png",
        contentType: "image/png",
      },
    ]);

    const response = await app.inject({
      method: "POST",
      url: `/conversations/${CONVERSATION_ID}/messages`,
      headers: {
        cookie,
        "content-type": `multipart/form-data; boundary=${multipart.boundary}`,
      },
      payload: multipart.body,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");

    await app.close();
  });

  it("仅附件无 content 也可发送", async () => {
    const { app, cookie } = await createAuthedApp();
    const multipart = buildMultipart([
      {
        name: "file",
        value: "only file body",
        fileName: "only.txt",
        contentType: "text/plain",
      },
    ]);

    const response = await app.inject({
      method: "POST",
      url: `/conversations/${CONVERSATION_ID}/messages`,
      headers: {
        cookie,
        "content-type": `multipart/form-data; boundary=${multipart.boundary}`,
      },
      payload: multipart.body,
    });

    expect(response.statusCode).toBe(200);
    const events = parseSseEvents(response.body);
    expect(events[0]?.data.content).toContain("only file body");
    expect(events[0]?.data.attachment.fileName).toBe("only.txt");

    await app.close();
  });
});
