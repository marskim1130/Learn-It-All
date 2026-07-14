import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import {
  createMemoryLoginRateLimiter,
  LOGIN_RATE_LIMIT_MAX_FAILURES,
  loginRateLimitKey,
} from "../src/auth/login-rate-limit.js";
import { hashPassword } from "../src/auth/password.js";
import { createMemoryUserRepository } from "../src/auth/users.js";

const ALICE_ID = "11111111-1111-1111-1111-111111111111";

async function createAppWithLimiter(
  limiter = createMemoryLoginRateLimiter(),
) {
  const users = createMemoryUserRepository([
    {
      id: ALICE_ID,
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
    loginRateLimiter: limiter,
  });

  return { app, limiter };
}

describe("POST /auth/login rate limit", () => {
  it("失败达到阈值后返回 429 TOO_MANY_REQUESTS 与 retryAfterSeconds", async () => {
    const { app } = await createAppWithLimiter();

    for (let i = 0; i < LOGIN_RATE_LIMIT_MAX_FAILURES; i += 1) {
      const failed = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "alice@example.com",
          password: "wrong-password",
        },
      });
      expect(failed.statusCode).toBe(401);
    }

    const limited = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "alice@example.com",
        password: "wrong-password",
      },
    });

    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({
      error: {
        code: "TOO_MANY_REQUESTS",
        message: expect.any(String),
        retryAfterSeconds: expect.any(Number),
      },
    });
    expect(limited.json().error.retryAfterSeconds).toBeGreaterThan(0);

    await app.close();
  });

  it("限流键仅包含规范化邮箱，不包含密码", async () => {
    const limiter = createMemoryLoginRateLimiter();
    const key = limiter.keyFor("Alice@Example.com");
    expect(key).toBe(loginRateLimitKey("alice@example.com"));
    expect(key).toBe("login:fail:alice@example.com");
    expect(key).not.toMatch(/password|secret|wrong/i);

    const decision = await limiter.registerFailure("Alice@Example.com");
    expect(decision.key).toBe("login:fail:alice@example.com");
    expect(JSON.stringify(decision)).not.toMatch(/wrong-password|password123/);
  });

  it("TTL 到期后可再次尝试登录", async () => {
    let now = 1_000_000;
    const limiter = createMemoryLoginRateLimiter({
      now: () => now,
      windowSeconds: 60,
    });
    const { app } = await createAppWithLimiter(limiter);

    for (let i = 0; i < LOGIN_RATE_LIMIT_MAX_FAILURES; i += 1) {
      await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "alice@example.com", password: "wrong" },
      });
    }

    const limited = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "alice@example.com", password: "wrong" },
    });
    expect(limited.statusCode).toBe(429);

    now += 61_000;

    const afterTtl = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "alice@example.com", password: "wrong" },
    });
    expect(afterTtl.statusCode).toBe(401);

    await app.close();
  });

  it("成功登录后清除失败计数，可再次失败而不立即 429", async () => {
    const { app } = await createAppWithLimiter();

    for (let i = 0; i < LOGIN_RATE_LIMIT_MAX_FAILURES - 1; i += 1) {
      const failed = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "alice@example.com", password: "wrong" },
      });
      expect(failed.statusCode).toBe(401);
    }

    const ok = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "alice@example.com", password: "password123" },
    });
    expect(ok.statusCode).toBe(200);

    for (let i = 0; i < LOGIN_RATE_LIMIT_MAX_FAILURES; i += 1) {
      const failed = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "alice@example.com", password: "wrong" },
      });
      expect(failed.statusCode).toBe(401);
    }

    await app.close();
  });
});
