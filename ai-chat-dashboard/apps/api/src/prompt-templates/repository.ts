import { and, desc, eq } from "drizzle-orm";
import {
  promptTemplates as promptTemplatesTable,
  type Database,
} from "@ai-chat-dashboard/database";

/**
 * Prompt 模板公开字段。
 */
export interface PromptTemplate {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  body: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePromptTemplateInput {
  ownerId: string;
  name: string;
  description: string;
  body: string;
  tags: string[];
}

export interface UpdatePromptTemplateInput {
  name?: string;
  description?: string;
  body?: string;
  tags?: string[];
}

/**
 * Prompt 模板仓储 [Repository]。
 */
export interface PromptTemplateRepository {
  create(input: CreatePromptTemplateInput): Promise<PromptTemplate>;
  listByOwner(ownerId: string, query?: string): Promise<PromptTemplate[]>;
  findByIdForOwner(id: string, ownerId: string): Promise<PromptTemplate | null>;
  updateForOwner(
    id: string,
    ownerId: string,
    patch: UpdatePromptTemplateInput,
  ): Promise<PromptTemplate | null>;
  deleteForOwner(id: string, ownerId: string): Promise<boolean>;
}

/**
 * 进程内 Prompt 模板仓储。
 *
 * @example
 * const templates = createMemoryPromptTemplateRepository();
 * await templates.create({
 *   ownerId: "u1",
 *   name: "代码审查",
 *   description: "",
 *   body: "请审查…",
 *   tags: ["code"],
 * });
 */
export function createMemoryPromptTemplateRepository(
  seed: PromptTemplate[] = [],
): PromptTemplateRepository {
  const records = new Map(seed.map((item) => [item.id, item]));

  function matchesQuery(item: PromptTemplate, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) {
      return true;
    }
    return (
      item.name.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.body.toLowerCase().includes(q) ||
      item.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  }

  return {
    async create(input) {
      const now = new Date();
      const template: PromptTemplate = {
        id: crypto.randomUUID(),
        ownerId: input.ownerId,
        name: input.name,
        description: input.description,
        body: input.body,
        tags: [...input.tags],
        createdAt: now,
        updatedAt: now,
      };
      records.set(template.id, template);
      return template;
    },
    async listByOwner(ownerId, query = "") {
      return [...records.values()]
        .filter((item) => item.ownerId === ownerId && matchesQuery(item, query))
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    },
    async findByIdForOwner(id, ownerId) {
      const template = records.get(id);
      if (!template || template.ownerId !== ownerId) {
        return null;
      }
      return template;
    },
    async updateForOwner(id, ownerId, patch) {
      const existing = records.get(id);
      if (!existing || existing.ownerId !== ownerId) {
        return null;
      }
      const updated: PromptTemplate = {
        ...existing,
        name: patch.name ?? existing.name,
        description: patch.description ?? existing.description,
        body: patch.body ?? existing.body,
        tags: patch.tags ? [...patch.tags] : existing.tags,
        updatedAt: new Date(),
      };
      records.set(id, updated);
      return updated;
    },
    async deleteForOwner(id, ownerId) {
      const existing = records.get(id);
      if (!existing || existing.ownerId !== ownerId) {
        return false;
      }
      return records.delete(id);
    },
  };
}

function mapRow(row: {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  body: string;
  tags: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}): PromptTemplate {
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    description: row.description,
    body: row.body,
    tags: Array.isArray(row.tags) ? row.tags : [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * 基于 PostgreSQL 的 Prompt 模板仓储。
 */
export function createDatabasePromptTemplateRepository(
  database: Database,
): PromptTemplateRepository {
  return {
    async create(input) {
      const [row] = await database.client
        .insert(promptTemplatesTable)
        .values({
          ownerId: input.ownerId,
          name: input.name,
          description: input.description,
          body: input.body,
          tags: input.tags,
        })
        .returning({
          id: promptTemplatesTable.id,
          ownerId: promptTemplatesTable.ownerId,
          name: promptTemplatesTable.name,
          description: promptTemplatesTable.description,
          body: promptTemplatesTable.body,
          tags: promptTemplatesTable.tags,
          createdAt: promptTemplatesTable.createdAt,
          updatedAt: promptTemplatesTable.updatedAt,
        });

      if (!row) {
        throw new Error("创建模板失败");
      }

      return mapRow(row);
    },
    async listByOwner(ownerId, query = "") {
      const rows = await database.client
        .select({
          id: promptTemplatesTable.id,
          ownerId: promptTemplatesTable.ownerId,
          name: promptTemplatesTable.name,
          description: promptTemplatesTable.description,
          body: promptTemplatesTable.body,
          tags: promptTemplatesTable.tags,
          createdAt: promptTemplatesTable.createdAt,
          updatedAt: promptTemplatesTable.updatedAt,
        })
        .from(promptTemplatesTable)
        .where(eq(promptTemplatesTable.ownerId, ownerId))
        .orderBy(desc(promptTemplatesTable.updatedAt));

      const q = query.trim().toLowerCase();
      return rows
        .map(mapRow)
        .filter((item) => {
          if (!q) {
            return true;
          }
          return (
            item.name.toLowerCase().includes(q) ||
            item.description.toLowerCase().includes(q) ||
            item.body.toLowerCase().includes(q) ||
            item.tags.some((tag) => tag.toLowerCase().includes(q))
          );
        });
    },
    async findByIdForOwner(id, ownerId) {
      const [row] = await database.client
        .select({
          id: promptTemplatesTable.id,
          ownerId: promptTemplatesTable.ownerId,
          name: promptTemplatesTable.name,
          description: promptTemplatesTable.description,
          body: promptTemplatesTable.body,
          tags: promptTemplatesTable.tags,
          createdAt: promptTemplatesTable.createdAt,
          updatedAt: promptTemplatesTable.updatedAt,
        })
        .from(promptTemplatesTable)
        .where(
          and(
            eq(promptTemplatesTable.id, id),
            eq(promptTemplatesTable.ownerId, ownerId),
          ),
        )
        .limit(1);

      return row ? mapRow(row) : null;
    },
    async updateForOwner(id, ownerId, patch) {
      const [row] = await database.client
        .update(promptTemplatesTable)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined
            ? { description: patch.description }
            : {}),
          ...(patch.body !== undefined ? { body: patch.body } : {}),
          ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(promptTemplatesTable.id, id),
            eq(promptTemplatesTable.ownerId, ownerId),
          ),
        )
        .returning({
          id: promptTemplatesTable.id,
          ownerId: promptTemplatesTable.ownerId,
          name: promptTemplatesTable.name,
          description: promptTemplatesTable.description,
          body: promptTemplatesTable.body,
          tags: promptTemplatesTable.tags,
          createdAt: promptTemplatesTable.createdAt,
          updatedAt: promptTemplatesTable.updatedAt,
        });

      return row ? mapRow(row) : null;
    },
    async deleteForOwner(id, ownerId) {
      const deleted = await database.client
        .delete(promptTemplatesTable)
        .where(
          and(
            eq(promptTemplatesTable.id, id),
            eq(promptTemplatesTable.ownerId, ownerId),
          ),
        )
        .returning({ id: promptTemplatesTable.id });

      return deleted.length > 0;
    },
  };
}
