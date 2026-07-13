import { eq } from "drizzle-orm";
import { users } from "@ai-chat-dashboard/database";
import type { Database } from "@ai-chat-dashboard/database";

/**
 * 持久化中的用户记录；密码字段只保存摘要。
 */
export interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
}

/**
 * 用户仓储 [Repository] 的公开接缝，便于测试替换实现。
 */
export interface UserRepository {
  create(input: CreateUserInput): Promise<StoredUser>;
  findByEmail(email: string): Promise<StoredUser | null>;
}

/**
 * 进程内用户仓储，供无数据库时的行为测试使用。
 *
 * @example
 * const users = createMemoryUserRepository();
 * await users.create({ email: "a@example.com", passwordHash: "hash" });
 */
export function createMemoryUserRepository(seed: StoredUser[] = []): UserRepository {
  const records = new Map(seed.map((user) => [user.email, user]));

  return {
    async create(input) {
      if (records.has(input.email)) {
        throw new EmailAlreadyExistsError(input.email);
      }

      const user: StoredUser = {
        id: crypto.randomUUID(),
        email: input.email,
        passwordHash: input.passwordHash,
        createdAt: new Date(),
      };
      records.set(user.email, user);
      return user;
    },
    async findByEmail(email) {
      return records.get(email) ?? null;
    },
  };
}

/**
 * 基于 PostgreSQL 的用户仓储。
 */
export function createDatabaseUserRepository(database: Database): UserRepository {
  return {
    async create(input) {
      try {
        const [user] = await database.client
          .insert(users)
          .values({
            email: input.email,
            passwordHash: input.passwordHash,
          })
          .returning({
            id: users.id,
            email: users.email,
            passwordHash: users.passwordHash,
            createdAt: users.createdAt,
          });

        if (!user) {
          throw new Error("创建用户失败");
        }

        return user;
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new EmailAlreadyExistsError(input.email);
        }
        throw error;
      }
    },
    async findByEmail(email) {
      const [user] = await database.client
        .select({
          id: users.id,
          email: users.email,
          passwordHash: users.passwordHash,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      return user ?? null;
    },
  };
}

export class EmailAlreadyExistsError extends Error {
  readonly code = "EMAIL_ALREADY_EXISTS" as const;

  constructor(email: string) {
    super(`邮箱已注册: ${email}`);
    this.name = "EmailAlreadyExistsError";
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}
