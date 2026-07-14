import { describe, expect, it } from "vitest";

import {
  ChatTurnError,
  createChatTurnModule,
  Utterance,
} from "../src/chat-turn/index.js";
import {
  createEchoChatModelProvider,
  type ChatModelProvider,
} from "../src/chat/provider.js";
import { createMemoryConversationRepository } from "../src/conversations/repository.js";
import { createMemoryTitleQueue } from "../src/jobs/title-queue.js";
import { createMemoryMessageRepository } from "../src/messages/repository.js";
import { createMemoryPromptTemplateRepository } from "../src/prompt-templates/repository.js";

const OWNER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_OWNER_ID = "22222222-2222-2222-2222-222222222222";
const CONVERSATION_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TEMPLATE_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function createTurn(options?: {
  title?: string;
  ownerId?: string;
  chatModel?: ChatModelProvider;
  withTemplate?: boolean;
}) {
  const ownerId = options?.ownerId ?? OWNER_ID;
  const conversations = createMemoryConversationRepository([
    {
      id: CONVERSATION_ID,
      ownerId,
      title: options?.title ?? "新会话",
      createdAt: new Date("2026-07-13T01:00:00.000Z"),
      updatedAt: new Date("2026-07-13T01:00:00.000Z"),
    },
  ]);
  const messages = createMemoryMessageRepository();
  const titleQueue = createMemoryTitleQueue();
  const promptTemplates = createMemoryPromptTemplateRepository(
    options?.withTemplate
      ? [
          {
            id: TEMPLATE_ID,
            ownerId,
            name: "问候",
            description: "",
            body: "你好 {{name}}，主题 {{topic}}",
            tags: ["greet"],
            createdAt: new Date("2026-07-13T01:00:00.000Z"),
            updatedAt: new Date("2026-07-13T01:00:00.000Z"),
          },
        ]
      : [],
  );

  const chatTurn = createChatTurnModule({
    conversations,
    messages,
    promptTemplates,
    chatModel: options?.chatModel ?? createEchoChatModelProvider(),
    titleQueue,
  });

  return { chatTurn, messages, titleQueue, conversations };
}

describe("ChatTurnModule.stream", () => {
  it("明文 utterance 产出有序领域事件并持久化完成的用户与助手消息", async () => {
    const { chatTurn, messages, titleQueue } = createTurn();

    const events = [];
    for await (const event of chatTurn.stream(
      { ownerId: OWNER_ID, conversationId: CONVERSATION_ID },
      "你好",
    )) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual([
      "user_message",
      "assistant_started",
      "assistant_delta",
      "assistant_delta",
      "assistant_completed",
    ]);

    expect(events[0]).toMatchObject({
      type: "user_message",
      message: {
        role: "user",
        content: "你好",
        status: "completed",
        promptTemplateId: null,
      },
    });
    expect(events[1]).toMatchObject({
      type: "assistant_started",
      message: {
        role: "assistant",
        content: "",
        status: "generating",
      },
    });
    expect(events.at(-1)).toMatchObject({
      type: "assistant_completed",
      message: {
        role: "assistant",
        content: "你好",
        status: "completed",
      },
    });

    const stored = await messages.listByConversation(CONVERSATION_ID);
    expect(stored).toHaveLength(2);
    expect(stored[0]).toMatchObject({
      role: "user",
      content: "你好",
      status: "completed",
    });
    expect(stored[1]).toMatchObject({
      role: "assistant",
      content: "你好",
      status: "completed",
    });
    expect(titleQueue.jobs).toHaveLength(1);
    expect(titleQueue.jobs[0]).toMatchObject({
      conversationId: CONVERSATION_ID,
      ownerId: OWNER_ID,
      seedText: "你好",
    });
  });

  it("会话不存在时在流开始前抛出 CONVERSATION_NOT_FOUND", async () => {
    const { chatTurn, messages } = createTurn();

    await expect(async () => {
      for await (const _event of chatTurn.stream(
        { ownerId: OWNER_ID, conversationId: "missing-conversation" },
        "你好",
      )) {
        // no events expected
      }
    }).rejects.toMatchObject({
      name: "ChatTurnError",
      code: "CONVERSATION_NOT_FOUND",
    });

    await expect(messages.listByConversation("missing-conversation")).resolves.toEqual(
      [],
    );
  });

  it("他人会话视为不存在，流前抛出 CONVERSATION_NOT_FOUND", async () => {
    const { chatTurn } = createTurn({ ownerId: OTHER_OWNER_ID });

    await expect(async () => {
      for await (const _event of chatTurn.stream(
        { ownerId: OWNER_ID, conversationId: CONVERSATION_ID },
        "你好",
      )) {
        // no events expected
      }
    }).rejects.toBeInstanceOf(ChatTurnError);
  });

  it("模板 utterance 渲染变量并写入 promptTemplateId", async () => {
    const { chatTurn, messages } = createTurn({ withTemplate: true });

    const events = [];
    for await (const event of chatTurn.stream(
      { ownerId: OWNER_ID, conversationId: CONVERSATION_ID },
      Utterance.template(TEMPLATE_ID, { name: "Alice", topic: "TDD" }),
    )) {
      events.push(event);
    }

    expect(events[0]).toMatchObject({
      type: "user_message",
      message: {
        role: "user",
        content: "你好 Alice，主题 TDD",
        status: "completed",
        promptTemplateId: TEMPLATE_ID,
      },
    });
    expect(events.at(-1)).toMatchObject({
      type: "assistant_completed",
      message: { content: "你好 Alice，主题 TDD", status: "completed" },
    });

    const stored = await messages.listByConversation(CONVERSATION_ID);
    expect(stored[0]).toMatchObject({
      content: "你好 Alice，主题 TDD",
      promptTemplateId: TEMPLATE_ID,
    });
  });

  it("缺少模板变量时流前抛出 MISSING_TEMPLATE_VARIABLES", async () => {
    const { chatTurn, messages } = createTurn({ withTemplate: true });

    try {
      for await (const _event of chatTurn.stream(
        { ownerId: OWNER_ID, conversationId: CONVERSATION_ID },
        Utterance.template(TEMPLATE_ID, { name: "Alice" }),
      )) {
        // no events expected
      }
      expect.unreachable("should throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ChatTurnError);
      expect(error).toMatchObject({
        code: "MISSING_TEMPLATE_VARIABLES",
        details: [{ field: "variables.topic", message: expect.any(String) }],
      });
    }

    await expect(messages.listByConversation(CONVERSATION_ID)).resolves.toEqual([]);
  });

  it("模型失败时 yield assistant_failed 并持久化为 failed", async () => {
    const failingModel: ChatModelProvider = {
      async *stream() {
        yield { delta: "半" };
        throw new Error("upstream failed");
      },
    };
    const { chatTurn, messages } = createTurn({ chatModel: failingModel });

    const events = [];
    for await (const event of chatTurn.stream(
      { ownerId: OWNER_ID, conversationId: CONVERSATION_ID },
      "你好",
    )) {
      events.push(event);
    }

    expect(events.map((event) => event.type)).toEqual([
      "user_message",
      "assistant_started",
      "assistant_delta",
      "assistant_failed",
    ]);
    expect(events.at(-1)).toMatchObject({
      type: "assistant_failed",
      message: {
        role: "assistant",
        content: "半",
        status: "failed",
      },
      reason: "模型生成失败",
    });

    const stored = await messages.listByConversation(CONVERSATION_ID);
    expect(stored[1]).toMatchObject({
      role: "assistant",
      content: "半",
      status: "failed",
    });
  });

  it("非默认标题时不入队标题任务", async () => {
    const { chatTurn, titleQueue } = createTurn({ title: "已有标题" });

    for await (const _event of chatTurn.stream(
      { ownerId: OWNER_ID, conversationId: CONVERSATION_ID },
      "第二条场景",
    )) {
      // drain
    }

    expect(titleQueue.jobs).toHaveLength(0);
  });
});
