import type { Message, MessageAttachment } from "../messages/repository.js";

export interface ChatTurnScope {
  ownerId: string;
  conversationId: string;
}

export interface AttachmentIngress extends MessageAttachment {
  text: string;
}

/**
 * 用户表达 [Utterance]：闭合 ADT，避免 HTTP 字段汤。
 */
export type Utterance =
  | {
      readonly kind: "plain";
      readonly text: string;
      readonly attachment: AttachmentIngress | null;
    }
  | {
      readonly kind: "template";
      readonly templateId: string;
      readonly variables: Readonly<Record<string, string>>;
      readonly attachment: AttachmentIngress | null;
    };

export const Utterance = {
  plain(text: string): Utterance {
    return { kind: "plain", text, attachment: null };
  },
  template(
    templateId: string,
    variables: Readonly<Record<string, string>> = {},
  ): Utterance {
    return { kind: "template", templateId, variables, attachment: null };
  },
  withAttachment(utterance: Utterance, attachment: AttachmentIngress): Utterance {
    return { ...utterance, attachment };
  },
} as const;

/**
 * 领域事件 [Chat Turn Event]：有序、传输无关。
 */
export type ChatTurnEvent =
  | { type: "user_message"; message: Message }
  | { type: "assistant_started"; message: Message }
  | { type: "assistant_delta"; messageId: string; delta: string }
  | { type: "assistant_completed"; message: Message }
  | { type: "assistant_failed"; message: Message; reason: string };

export type ChatTurnErrorCode =
  | "CONVERSATION_NOT_FOUND"
  | "PROMPT_TEMPLATE_NOT_FOUND"
  | "MISSING_TEMPLATE_VARIABLES"
  | "EMPTY_CONTENT";

export class ChatTurnError extends Error {
  readonly code: ChatTurnErrorCode;
  readonly details?: Array<{ field: string; message: string }>;

  constructor(
    code: ChatTurnErrorCode,
    message: string,
    details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
    this.name = "ChatTurnError";
    this.code = code;
    if (details) {
      this.details = details;
    }
  }
}

export interface ChatTurnStreamOptions {
  signal?: AbortSignal;
}

export interface ChatTurnModule {
  stream(
    scope: ChatTurnScope,
    utterance: string | Utterance,
    options?: ChatTurnStreamOptions,
  ): AsyncIterable<ChatTurnEvent>;
}
