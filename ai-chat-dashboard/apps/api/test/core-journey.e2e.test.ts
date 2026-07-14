import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { createMemoryLoginRateLimiter } from "../src/auth/login-rate-limit.js";
import { createEchoChatModelProvider } from "../src/chat/provider.js";
import { createMemoryConversationRepository } from "../src/conversations/repository.js";
import { createMemoryTitleQueue } from "../src/jobs/title-queue.js";
import { processTitleJob } from "../src/jobs/title-worker.js";
import { createMemoryMessageRepository } from "../src/messages/repository.js";
import { createMemoryPromptTemplateRepository } from "../src/prompt-templates/repository.js";
import { createMemoryUserRepository } from "../src/auth/users.js";

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

function cookieFrom(response: { headers: Record<string, unknown> }): string {
  const setCookie = response.headers["set-cookie"];
  const cookieValue = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  const accessToken = String(cookieValue ?? "").match(/access_token=([^;]+)/)?.[1];
  return `access_token=${accessToken}`;
}

/**
 * 核心用户旅程端到端测试：
 * 注册 → 登录 → 创建会话 → 模板变量发消息 → 附件发消息 → 流式回复 → 标题任务。
 * 使用假模型与内存依赖，不访问外网。
 */
describe("core user journey e2e", () => {
  const users = createMemoryUserRepository();
  const conversations = createMemoryConversationRepository();
  const messages = createMemoryMessageRepository();
  const promptTemplates = createMemoryPromptTemplateRepository();
  const titleQueue = createMemoryTitleQueue();
  let app: ReturnType<typeof buildApp>;

  beforeAll(() => {
    app = buildApp({
      database: {
        checkConnection: async () => true,
      },
      users,
      conversations,
      messages,
      promptTemplates,
      chatModel: createEchoChatModelProvider(),
      loginRateLimiter: createMemoryLoginRateLimiter(),
      titleQueue,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("完成注册登录、会话、模板消息、附件消息与标题任务", async () => {
    const email = `journey-${Date.now()}@example.com`;
    const password = "password123";

    const register = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email, password },
    });
    expect(register.statusCode).toBe(201);
    expect(register.json().user.email).toBe(email);

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password },
    });
    expect(login.statusCode).toBe(200);
    expect(login.headers["set-cookie"]).toBeTruthy();
    const cookie = cookieFrom(login);

    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe(email);

    const createdConversation = await app.inject({
      method: "POST",
      url: "/conversations",
      headers: { cookie },
      payload: {},
    });
    expect(createdConversation.statusCode).toBe(201);
    const conversationId = createdConversation.json().conversation.id as string;
    expect(createdConversation.json().conversation.title).toBe("新会话");

    const template = await app.inject({
      method: "POST",
      url: "/prompt-templates",
      headers: { cookie },
      payload: {
        name: "旅程模板",
        description: "e2e",
        body: "你好 {{name}}，主题 {{topic}}",
        tags: ["e2e"],
      },
    });
    expect(template.statusCode).toBe(201);
    const templateId = template.json().promptTemplate.id as string;

    const variables = await app.inject({
      method: "GET",
      url: `/prompt-templates/${templateId}/variables`,
      headers: { cookie },
    });
    expect(variables.statusCode).toBe(200);
    expect(variables.json().variables).toEqual(["name", "topic"]);

    const firstMessage = await app.inject({
      method: "POST",
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie },
      payload: {
        promptTemplateId: templateId,
        variables: { name: "Alice", topic: "TDD" },
      },
    });
    expect(firstMessage.statusCode).toBe(200);
    expect(firstMessage.headers["content-type"]).toMatch(/text\/event-stream/);
    const firstEvents = parseSseEvents(firstMessage.body);
    const firstEventNames = firstEvents.map((item) => item.event);
    expect(firstEventNames[0]).toBe("message.user");
    expect(firstEventNames[1]).toBe("message.assistant.started");
    expect(firstEventNames.at(-1)).toBe("message.assistant.completed");
    expect(
      firstEventNames.filter((name) => name === "message.assistant.delta").length,
    ).toBeGreaterThan(0);
    expect(firstEvents[0]?.data).toMatchObject({
      role: "user",
      content: "你好 Alice，主题 TDD",
      promptTemplateId: templateId,
      status: "completed",
    });
    expect(firstEvents.at(-1)?.data).toMatchObject({
      role: "assistant",
      content: "你好 Alice，主题 TDD",
      status: "completed",
    });

    expect(titleQueue.jobs).toHaveLength(1);
    const titleResult = await processTitleJob(titleQueue.jobs[0]!, conversations);
    expect(titleResult.updated).toBe(true);

    const renamed = await app.inject({
      method: "GET",
      url: `/conversations/${conversationId}`,
      headers: { cookie },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().conversation.title).toBe("你好 Alice，主题 TDD");

    const boundary = "----e2e-boundary";
    const multipartBody = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="content"',
      "",
      "请阅读附件",
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="notes.md"',
      "Content-Type: text/markdown",
      "",
      "# 附件正文",
      `--${boundary}--`,
      "",
    ].join("\r\n");

    const attachmentMessage = await app.inject({
      method: "POST",
      url: `/conversations/${conversationId}/messages`,
      headers: {
        cookie,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload: multipartBody,
    });
    expect(attachmentMessage.statusCode).toBe(200);
    const attachmentEvents = parseSseEvents(attachmentMessage.body);
    expect(attachmentEvents[0]?.data.content).toContain("附件正文");
    expect(attachmentEvents[0]?.data.attachment).toEqual({
      fileName: "notes.md",
      mimeType: "text/markdown",
      sizeBytes: expect.any(Number),
    });

    const history = await app.inject({
      method: "GET",
      url: `/conversations/${conversationId}/messages`,
      headers: { cookie },
    });
    expect(history.statusCode).toBe(200);
    expect(history.json().messages.length).toBeGreaterThanOrEqual(4);

    // 第二条消息不应再次入队标题任务
    expect(titleQueue.jobs).toHaveLength(1);
  });
});
