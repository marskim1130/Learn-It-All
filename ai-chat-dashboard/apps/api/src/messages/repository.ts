import { asc, eq } from "drizzle-orm";
import { messages as messagesTable, type Database } from "@ai-chat-dashboard/database";

/**
 * 消息角色与生命周期状态。
 */
export type MessageRole = "user" | "assistant";
export type MessageStatus = "generating" | "completed" | "failed";

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  createdAt: Date;
}

export interface CreateMessageInput {
  conversationId: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
}

/**
 * 消息仓储 [Repository]：按会话读写，供流式发送与历史查询使用。
 */
export interface MessageRepository {
  create(input: CreateMessageInput): Promise<Message>;
  update(
    id: string,
    patch: Partial<Pick<Message, "content" | "status">>,
  ): Promise<Message | null>;
  listByConversation(conversationId: string): Promise<Message[]>;
}

/**
 * 进程内消息仓储。
 *
 * @example
 * const messages = createMemoryMessageRepository();
 * await messages.create({
 *   conversationId: "c1",
 *   role: "user",
 *   content: "你好",
 *   status: "completed",
 * });
 */
export function createMemoryMessageRepository(seed: Message[] = []): MessageRepository {
  const records = new Map(seed.map((item) => [item.id, item]));

  return {
    async create(input) {
      const message: Message = {
        id: crypto.randomUUID(),
        conversationId: input.conversationId,
        role: input.role,
        content: input.content,
        status: input.status,
        createdAt: new Date(),
      };
      records.set(message.id, message);
      return message;
    },
    async update(id, patch) {
      const existing = records.get(id);
      if (!existing) {
        return null;
      }
      const updated: Message = {
        ...existing,
        ...patch,
      };
      records.set(id, updated);
      return updated;
    },
    async listByConversation(conversationId) {
      return [...records.values()]
        .filter((item) => item.conversationId === conversationId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    },
  };
}

function mapRow(row: {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  status: string;
  createdAt: Date;
}): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role as MessageRole,
    content: row.content,
    status: row.status as MessageStatus,
    createdAt: row.createdAt,
  };
}

/**
 * 基于 PostgreSQL 的消息仓储；会话删除时由外键级联清理。
 */
export function createDatabaseMessageRepository(database: Database): MessageRepository {
  return {
    async create(input) {
      const [row] = await database.client
        .insert(messagesTable)
        .values({
          conversationId: input.conversationId,
          role: input.role,
          content: input.content,
          status: input.status,
        })
        .returning({
          id: messagesTable.id,
          conversationId: messagesTable.conversationId,
          role: messagesTable.role,
          content: messagesTable.content,
          status: messagesTable.status,
          createdAt: messagesTable.createdAt,
        });

      if (!row) {
        throw new Error("创建消息失败");
      }

      return mapRow(row);
    },
    async update(id, patch) {
      const [row] = await database.client
        .update(messagesTable)
        .set({
          ...(patch.content !== undefined ? { content: patch.content } : {}),
          ...(patch.status !== undefined ? { status: patch.status } : {}),
        })
        .where(eq(messagesTable.id, id))
        .returning({
          id: messagesTable.id,
          conversationId: messagesTable.conversationId,
          role: messagesTable.role,
          content: messagesTable.content,
          status: messagesTable.status,
          createdAt: messagesTable.createdAt,
        });

      return row ? mapRow(row) : null;
    },
    async listByConversation(conversationId) {
      const rows = await database.client
        .select({
          id: messagesTable.id,
          conversationId: messagesTable.conversationId,
          role: messagesTable.role,
          content: messagesTable.content,
          status: messagesTable.status,
          createdAt: messagesTable.createdAt,
        })
        .from(messagesTable)
        .where(eq(messagesTable.conversationId, conversationId))
        .orderBy(asc(messagesTable.createdAt));

      return rows.map(mapRow);
    },
  };
}
