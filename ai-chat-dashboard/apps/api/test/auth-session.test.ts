import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth/password.js";
import { createMemoryUserRepository } from "../src/auth/users.js";

describe("POST /auth/login", () => {
  it("有效凭据登录成功并设置 HttpOnly Cookie", async () => {
    const users = createMemoryUserRepository([
      {
        id: "11111111-1111-1111-1111-111111111111",
        email: "alice@example.com",
        passwordHash: await hashPassword("password123"),
        createdAt: new Date("2026-07-13T00:00:00.000Z"),
      },
    ]);

    const app = buildApp({
      database: {
        checkConnection: async () => true,
      },
      users,
    });

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "alice@example.com",
        password: "password123",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      user: {
        id: "11111111-1111-1111-1111-111111111111",
        email: "alice@example.com",
        createdAt: "2026-07-13T00:00:00.000Z",
      },
    });

    const setCookie = response.headers["set-cookie"];
    const cookieHeader = Array.isArray(setCookie) ? setCookie.join(";") : setCookie;
    expect(cookieHeader).toBeTruthy();
    expect(cookieHeader).toMatch(/access_token=/);
    expect(cookieHeader?.toLowerCase()).toContain("httponly");
    expect(cookieHeader?.toLowerCase()).toContain("samesite=lax");
    expect(cookieHeader?.toLowerCase()).toContain("path=/");

    await app.close();
  });

  it("错误密码返回 401 INVALID_CREDENTIALS", async () => {
    const users = createMemoryUserRepository([
      {
        id: "11111111-1111-1111-1111-111111111111",
        email: "alice@example.com",
        passwordHash: await hashPassword("password123"),
        createdAt: new Date("2026-07-13T00:00:00.000Z"),
      },
    ]);

    const app = buildApp({
      database: {
        checkConnection: async () => true,
      },
      users,
    });

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "alice@example.com",
        password: "wrong-password",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: {
        code: "INVALID_CREDENTIALS",
        message: expect.any(String),
      },
    });
    expect(response.headers["set-cookie"]).toBeUndefined();

    await app.close();
  });

  it("不存在的邮箱返回同样的 401 INVALID_CREDENTIALS", async () => {
    const app = buildApp({
      database: {
        checkConnection: async () => true,
      },
      users: createMemoryUserRepository(),
    });

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "missing@example.com",
        password: "password123",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: {
        code: "INVALID_CREDENTIALS",
        message: expect.any(String),
      },
    });
    expect(response.headers["set-cookie"]).toBeUndefined();

    await app.close();
  });
});

describe("GET /auth/me", () => {
  it("携带有效 Cookie 时返回当前用户", async () => {
    const users = createMemoryUserRepository([
      {
        id: "11111111-1111-1111-1111-111111111111",
        email: "alice@example.com",
        passwordHash: await hashPassword("password123"),
        createdAt: new Date("2026-07-13T00:00:00.000Z"),
      },
    ]);

    const app = buildApp({
      database: {
        checkConnection: async () => true,
      },
      users,
    });

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "alice@example.com",
        password: "password123",
      },
    });
    expect(login.statusCode).toBe(200);

    const setCookie = login.headers["set-cookie"];
    const cookieValue = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    const accessToken = cookieValue?.match(/access_token=([^;]+)/)?.[1];
    expect(accessToken).toBeTruthy();

    const response = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        cookie: `access_token=${accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      user: {
        id: "11111111-1111-1111-1111-111111111111",
        email: "alice@example.com",
        createdAt: "2026-07-13T00:00:00.000Z",
      },
    });

    await app.close();
  });

  it("无 Cookie 时返回 401 UNAUTHORIZED", async () => {
    const app = buildApp({
      database: {
        checkConnection: async () => true,
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/auth/me",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: expect.any(String),
      },
    });

    await app.close();
  });
});

describe("POST /auth/logout", () => {
  it("退出后 Cookie 失效且无法再访问当前身份", async () => {
    const users = createMemoryUserRepository([
      {
        id: "11111111-1111-1111-1111-111111111111",
        email: "alice@example.com",
        passwordHash: await hashPassword("password123"),
        createdAt: new Date("2026-07-13T00:00:00.000Z"),
      },
    ]);

    const app = buildApp({
      database: {
        checkConnection: async () => true,
      },
      users,
    });

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "alice@example.com",
        password: "password123",
      },
    });
    expect(login.statusCode).toBe(200);

    const setCookie = login.headers["set-cookie"];
    const cookieValue = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    const accessToken = cookieValue?.match(/access_token=([^;]+)/)?.[1];
    expect(accessToken).toBeTruthy();

    const logout = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: {
        cookie: `access_token=${accessToken}`,
      },
    });

    expect(logout.statusCode).toBe(204);
    const logoutCookie = logout.headers["set-cookie"];
    const logoutCookieHeader = Array.isArray(logoutCookie)
      ? logoutCookie.join(";")
      : logoutCookie;
    expect(logoutCookieHeader?.toLowerCase()).toContain("access_token=");
    expect(
      logoutCookieHeader?.toLowerCase().includes("max-age=0") ||
        logoutCookieHeader?.toLowerCase().includes("expires="),
    ).toBe(true);

    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: {
        cookie: `access_token=${accessToken}`,
      },
    });

    expect(me.statusCode).toBe(401);
    expect(me.json()).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: expect.any(String),
      },
    });

    await app.close();
  });
});
