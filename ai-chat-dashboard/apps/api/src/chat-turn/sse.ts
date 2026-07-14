import type { Message } from "../messages/repository.js";

import type { ChatTurnEvent } from "./types.js";

function toPublicMessage(message: Message) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    status: message.status,
    promptTemplateId: message.promptTemplateId,
    attachment: message.attachment,
    createdAt: message.createdAt.toISOString(),
  };
}

function formatSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * 将领域 Chat Turn Event 映射为现有 SSE 线路协议（缓冲发送）。
 */
export function mapChatTurnEventToSse(event: ChatTurnEvent): string {
  switch (event.type) {
    case "user_message":
      return formatSseEvent("message.user", toPublicMessage(event.message));
    case "assistant_started":
      return formatSseEvent(
        "message.assistant.started",
        toPublicMessage(event.message),
      );
    case "assistant_delta":
      return formatSseEvent("message.assistant.delta", {
        id: event.messageId,
        delta: event.delta,
      });
    case "assistant_completed":
      return formatSseEvent(
        "message.assistant.completed",
        toPublicMessage(event.message),
      );
    case "assistant_failed":
      return formatSseEvent("message.assistant.failed", {
        ...toPublicMessage(event.message),
        message: event.reason,
      });
  }
}

/**
 * 消费领域事件流并拼成缓冲 SSE 响应体。
 */
export async function bufferChatTurnAsSse(
  events: AsyncIterable<ChatTurnEvent>,
): Promise<string> {
  const chunks: string[] = [];
  for await (const event of events) {
    chunks.push(mapChatTurnEventToSse(event));
  }
  return chunks.join("");
}
