import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { createMemoryUserRepository, type StoredUser } from "../src/auth/users.js";

describe("POST /auth/register", () => {
  it("有效输入可创建用户并返回公开用户信息", async () => {
    const app = buildApp({
      database: {
        checkConnection: async () => true,
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "alice@example.com",
        password: "password123",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      user: {
        id: expect.any(String),
        email: "alice@example.com",
        createdAt: expect.any(String),
      },
    });
    expect(response.json()).not.toHaveProperty("user.password");
    expect(response.json()).not.toHaveProperty("user.passwordHash");

    await app.close();
  });

  it("重复邮箱返回 409 EMAIL_ALREADY_EXISTS", async () => {
    const app = buildApp({
      database: {
        checkConnection: async () => true,
      },
    });

    const payload = {
      email: "alice@example.com",
      password: "password123",
    };

    const first = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload,
    });
    expect(first.statusCode).toBe(201);

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

  it("无效邮箱返回 400 VALIDATION_ERROR", async () => {
    const app = buildApp({
      database: {
        checkConnection: async () => true,
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "not-an-email",
        password: "password123",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: expect.any(String),
        details: [
          {
            field: "email",
            message: expect.any(String),
          },
        ],
      },
    });

    await app.close();
  });

  it("过短密码返回 400 VALIDATION_ERROR", async () => {
    const app = buildApp({
      database: {
        checkConnection: async () => true,
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "alice@example.com",
        password: "short",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: expect.any(String),
        details: [
          {
            field: "password",
            message: expect.any(String),
          },
        ],
      },
    });

    await app.close();
  });

  it("密码明文不进入持久化记录", async () => {
    const stored: StoredUser[] = [];
    const users = createMemoryUserRepository();
    const originalCreate = users.create.bind(users);
    users.create = async (input) => {
      const user = await originalCreate(input);
      stored.push(user);
      return user;
    };

    const app = buildApp({
      database: {
        checkConnection: async () => true,
      },
      users,
    });

    const password = "password123";
    const response = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "secret@example.com",
        password,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.passwordHash).not.toBe(password);
    expect(stored[0]?.passwordHash.startsWith("$argon2")).toBe(true);
    expect(response.body).not.toContain(password);

    await app.close();
  });
});
