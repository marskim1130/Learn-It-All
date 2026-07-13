import { afterAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase("POST /auth/register with PostgreSQL", () => {
  let closeDatabase: (() => Promise<void>) | undefined;

  afterAll(async () => {
    await closeDatabase?.();
  });

  it("有效输入可创建用户，重复邮箱被数据库唯一约束拒绝", async () => {
    const { createDatabase } = await import("@ai-chat-dashboard/database");
    const { buildApp } = await import("../src/app.js");
    const { createDatabaseUserRepository } = await import("../src/auth/users.js");

    const database = createDatabase({ url: databaseUrl!, maxConnections: 1 });
    closeDatabase = () => database.close();

    const app = buildApp({
      database: {
        checkConnection: async () => {
          try {
            await database.checkConnection();
            return true;
          } catch {
            return false;
          }
        },
      },
      users: createDatabaseUserRepository(database),
    });

    const email = `issue-002-${crypto.randomUUID()}@example.com`;
    const payload = {
      email,
      password: "password123",
    };

    const first = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload,
    });

    expect(first.statusCode).toBe(201);
    expect(first.json()).toEqual({
      user: {
        id: expect.any(String),
        email,
        createdAt: expect.any(String),
      },
    });

    const second = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload,
    });

    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({
      error: {
        code: "EMAIL_ALREADY_EXISTS",
        message: expect.any(String),
      },
    });

    await app.close();
  });
});
