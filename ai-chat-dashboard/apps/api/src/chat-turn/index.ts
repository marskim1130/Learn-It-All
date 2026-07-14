import type { ChatModelProvider } from "../chat/provider.js";
import type { ConversationRepository } from "../conversations/repository.js";
import {
  shouldEnqueueTitleJob,
  type ConversationTitleQueue,
} from "../jobs/title-queue.js";
import { mergeMessageContentWithAttachment } from "../messages/attachments.js";
import type { MessageRepository } from "../messages/repository.js";
import type { PromptTemplateRepository } from "../prompt-templates/repository.js";
import {
  extractTemplateVariables,
  renderTemplate,
} from "../prompt-templates/variables.js";

import {
  ChatTurnError,
  Utterance,
  type ChatTurnEvent,
  type ChatTurnModule,
  type ChatTurnScope,
  type ChatTurnStreamOptions,
  type Utterance as UtteranceType,
} from "./types.js";

export type {
  AttachmentIngress,
  ChatTurnErrorCode,
  ChatTurnEvent,
  ChatTurnModule,
  ChatTurnScope,
  ChatTurnStreamOptions,
  Utterance as UtteranceType,
} from "./types.js";
export { ChatTurnError, Utterance } from "./types.js";

export interface ChatTurnDependencies {
  conversations: ConversationRepository;
  messages: MessageRepository;
  promptTemplates: PromptTemplateRepository;
  chatModel: ChatModelProvider;
  titleQueue: ConversationTitleQueue;
}

/**
 * 创建 Chat Turn module：明文或 Utterance → 有序领域事件流。
 *
 * @example
 * const chatTurn = createChatTurnModule(deps);
 * for await (const event of chatTurn.stream(scope, "你好")) {
 *   // map to SSE in HTTP adapter
 * }
 */
export function createChatTurnModule(
  deps: ChatTurnDependencies,
): ChatTurnModule {
  return {
    stream(scope, utterance, options) {
      return runChatTurn(deps, scope, normalizeUtterance(utterance), options);
    },
  };
}

function normalizeUtterance(utterance: string | UtteranceType): UtteranceType {
  if (typeof utterance === "string") {
    return Utterance.plain(utterance);
  }
  return utterance;
}

async function* runChatTurn(
  deps: ChatTurnDependencies,
  scope: ChatTurnScope,
  utterance: UtteranceType,
  options?: ChatTurnStreamOptions,
): AsyncGenerator<ChatTurnEvent> {
  const conversation = await deps.conversations.findByIdForOwner(
    scope.conversationId,
    scope.ownerId,
  );
  if (!conversation) {
    throw new ChatTurnError("CONVERSATION_NOT_FOUND", "会话不存在");
  }

  let content = "";
  let promptTemplateId: string | null = null;
  const attachment = utterance.attachment;

  if (utterance.kind === "plain") {
    content = utterance.text.trim();
  } else {
    const template = await deps.promptTemplates.findByIdForOwner(
      utterance.templateId,
      scope.ownerId,
    );
    if (!template) {
      throw new ChatTurnError("PROMPT_TEMPLATE_NOT_FOUND", "模板不存在");
    }

    const required = extractTemplateVariables(template.body);
    const missing = required.filter((name) => {
      const value = utterance.variables[name];
      return typeof value !== "string" || value.trim().length === 0;
    });
    if (missing.length > 0) {
      throw new ChatTurnError(
        "MISSING_TEMPLATE_VARIABLES",
        "请求参数无效",
        missing.map((name) => ({
          field: `variables.${name}`,
          message: `缺少变量 ${name}`,
        })),
      );
    }

    const values: Record<string, string> = {};
    for (const name of required) {
      values[name] = String(utterance.variables[name]).trim();
    }
    content = renderTemplate(template.body, values);
    promptTemplateId = template.id;
  }

  content = mergeMessageContentWithAttachment(content, attachment);
  if (!content) {
    throw new ChatTurnError("EMPTY_CONTENT", "消息内容不能为空", [
      { field: "content", message: "消息内容不能为空" },
    ]);
  }

  const userMessage = await deps.messages.create({
    conversationId: scope.conversationId,
    role: "user",
    content,
    status: "completed",
    promptTemplateId,
    attachment: attachment
      ? {
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
        }
      : null,
  });
  yield { type: "user_message", message: userMessage };

  try {
    const historyForTitle = await deps.messages.listByConversation(
      scope.conversationId,
    );
    const userMessageCount = historyForTitle.filter(
      (item) => item.role === "user",
    ).length;
    if (
      shouldEnqueueTitleJob({
        conversationTitle: conversation.title,
        userMessageCount,
      })
    ) {
      await deps.titleQueue.enqueue({
        conversationId: scope.conversationId,
        ownerId: scope.ownerId,
        seedText: content,
      });
    }
  } catch {
    // 标题入队失败不阻断回合
  }

  const assistantMessage = await deps.messages.create({
    conversationId: scope.conversationId,
    role: "assistant",
    content: "",
    status: "generating",
    promptTemplateId: null,
    attachment: null,
  });
  yield { type: "assistant_started", message: assistantMessage };

  const history = await deps.messages.listByConversation(scope.conversationId);
  let assistantContent = "";

  try {
    for await (const chunk of deps.chatModel.stream({
      messages: history
        .filter(
          (item) => item.status === "completed" || item.id === userMessage.id,
        )
        .map((item) => ({
          role: item.role,
          content: item.content,
        })),
      ...(options?.signal ? { signal: options.signal } : {}),
    })) {
      assistantContent += chunk.delta;
      yield {
        type: "assistant_delta",
        messageId: assistantMessage.id,
        delta: chunk.delta,
      };
    }

    const completed =
      (await deps.messages.update(assistantMessage.id, {
        content: assistantContent,
        status: "completed",
      })) ?? {
        ...assistantMessage,
        content: assistantContent,
        status: "completed" as const,
      };

    yield { type: "assistant_completed", message: completed };
  } catch {
    const failed =
      (await deps.messages.update(assistantMessage.id, {
        content: assistantContent,
        status: "failed",
      })) ?? {
        ...assistantMessage,
        content: assistantContent,
        status: "failed" as const,
      };

    yield {
      type: "assistant_failed",
      message: failed,
      reason: "模型生成失败",
    };
  }
}
