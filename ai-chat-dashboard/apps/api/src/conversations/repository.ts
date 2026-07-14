import { and, desc, eq } from "drizzle-orm";
import { conversations, type Database } from "@ai-chat-dashboard/database";

/**
 * 聊天会话的公开字段；不包含跨用户标识以外的敏感数据。
 */
export interface Conversation {
  id: string;
  ownerId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateConversationInput {
  ownerId: string;
  title: string;
}

/**
 * 会话仓储 [Repository]：查询始终由调用方传入 ownerId，保证数据隔离。
 */
export interface ConversationRepository {
  create(input: CreateConversationInput): Promise<Conversation>;
  listByOwner(ownerId: string): Promise<Conversation[]>;
  findByIdForOwner(id: string, ownerId: string): Promise<Conversation | null>;
  renameForOwner(
    id: string,
    ownerId: string,
    title: string,
  ): Promise<Conversation | null>;
  deleteForOwner(id: string, ownerId: string): Promise<boolean>;
}

/**
 * 进程内会话仓储，供无数据库时的行为测试使用。
 *
 * @example
 * const conversations = createMemoryConversationRepository();
 * await conversations.create({ ownerId: "u1", title: "学习计划" });
 */
export function createMemoryConversationRepository(
  seed: Conversation[] = [],
): ConversationRepository {
  const records = new Map(seed.map((item) => [item.id, item]));

  return {
    async create(input) {
      const now = new Date();
      const conversation: Conversation = {
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        title: input.title,
        createdAt: now,
        updatedAt: now,
      };
      records.set(conversation.id, conversation);
      return conversation;
    },
    async listByOwner(ownerId) {
      return [...records.values()]
        .filter((item) => item.ownerId === ownerId)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    },
    async findByIdForOwner(id, ownerId) {
      const conversation = records.get(id);
      if (!conversation || conversation.ownerId !== ownerId) {
        return null;
      }
      return conversation;
    },
    async renameForOwner(id, ownerId, title) {
      const conversation = records.get(id);
      if (!conversation || conversation.ownerId !== ownerId) {
        return null;
      }

      const updated: Conversation = {
        ...conversation,
        title,
        updatedAt: new Date(),
      };
      records.set(id, updated);
      return updated;
    },
    async deleteForOwner(id, ownerId) {
      const conversation = records.get(id);
      if (!conversation || conversation.ownerId !== ownerId) {
        return false;
      }
      return records.delete(id);
    },
  };
}

/**
 * 基于 PostgreSQL 的会话仓储；所有读取都绑定 ownerId。
 */
export function createDatabaseConversationRepository(
  database: Database,
): ConversationRepository {
  return {
    async create(input) {
      const [conversation] = await database.client
        .insert(conversations)
        .values({
          ownerId: input.ownerId,
          title: input.title,
        })
        .returning({
          id: conversations.id,
          ownerId: conversations.ownerId,
          title: conversations.title,
          createdAt: conversations.createdAt,
          updatedAt: conversations.updatedAt,
        });

      if (!conversation) {
        throw new Error("创建会话失败");
      }

      return conversation;
    },
    async listByOwner(ownerId) {
      return database.client
        .select({
          id: conversations.id,
          ownerId: conversations.ownerId,
          title: conversations.title,
          createdAt: conversations.createdAt,
          updatedAt: conversations.updatedAt,
        })
        .from(conversations)
        .where(eq(conversations.ownerId, ownerId))
        .orderBy(desc(conversations.updatedAt));
    },
    async findByIdForOwner(id, ownerId) {
      const [conversation] = await database.client
        .select({
          id: conversations.id,
          ownerId: conversations.ownerId,
          title: conversations.title,
          createdAt: conversations.createdAt,
          updatedAt: conversations.updatedAt,
        })
        .from(conversations)
        .where(and(eq(conversations.id, id), eq(conversations.ownerId, ownerId)))
        .limit(1);

      return conversation ?? null;
    },
    async renameForOwner(id, ownerId, title) {
      const [conversation] = await database.client
        .update(conversations)
        .set({
          title,
          updatedAt: new Date(),
        })
        .where(and(eq(conversations.id, id), eq(conversations.ownerId, ownerId)))
        .returning({
          id: conversations.id,
          ownerId: conversations.ownerId,
          title: conversations.title,
          createdAt: conversations.createdAt,
          updatedAt: conversations.updatedAt,
        });

      return conversation ?? null;
    },
    async deleteForOwner(id, ownerId) {
      const deleted = await database.client
        .delete(conversations)
        .where(and(eq(conversations.id, id), eq(conversations.ownerId, ownerId)))
        .returning({ id: conversations.id });

      return deleted.length > 0;
    },
  };
}
