import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * 用户表：保存注册账户的公开标识与密码摘要。
 *
 * @example
 * import { users } from "@ai-chat-dashboard/database";
 * // 通过 Drizzle 插入时只写入 passwordHash，不写明文密码。
 */
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

/**
 * 聊天会话表：归属单个用户，列表与详情查询始终约束 owner_id。
 *
 * @example
 * import { conversations } from "@ai-chat-dashboard/database";
 */
export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const schema = {
  users,
  conversations,
};
