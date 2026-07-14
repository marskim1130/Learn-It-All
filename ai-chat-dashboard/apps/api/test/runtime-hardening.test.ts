import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import {
  createRequestId,
  redactSensitive,
  type StructuredLogger,
} from "../src/observability/logging.js";
import { createShutdownController } from "../src/observability/shutdown.js";

describe("runtime hardening", () => {
  it("响应包含 x-request-id，并接受客户端传入的关联 ID", async () => {
    const app = buildApp({
      database: {
        checkConnection: async () => true,
      },
    });

    const generated = await app.inject({
      method: "GET",
      url: "/health/live",
    });
    expect(generated.statusCode).toBe(200);
    expect(generated.headers["x-request-id"]).toEqual(expect.any(String));
    expect(String(generated.headers["x-request-id"]).length).toBeGreaterThan(0);

    const echoed = await app.inject({
      method: "GET",
      url: "/health/live",
      headers: {
        "x-request-id": "client-corr-123",
      },
    });
    expect(echoed.headers["x-request-id"]).toBe("client-corr-123");

    await app.close();
  });

  it("日志脱敏过滤密码、令牌和密钥", () => {
    const payload = {
      email: "alice@example.com",
      password: "password123",
      access_token: "tok_abc",
      authorization: "Bearer secret",
      OPENAI_API_KEY: "sk-live",
      nested: {
        refreshToken: "r1",
        safe: "ok",
      },
    };

    expect(redactSensitive(payload)).toEqual({
      email: "alice@example.com",
      password: "[REDACTED]",
      access_token: "[REDACTED]",
      authorization: "[REDACTED]",
      OPENAI_API_KEY: "[REDACTED]",
      nested: {
        refreshToken: "[REDACTED]",
        safe: "ok",
      },
    });
    expect(createRequestId()).toEqual(expect.any(String));
  });

  it("优雅关闭后拒绝新请求", async () => {
    const logger: StructuredLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    };
    const shutdown = createShutdownController({ logger });
    const app = buildApp({
      database: {
        checkConnection: async () => true,
      },
      shutdown,
      logger,
    });

    const live = await app.inject({ method: "GET", url: "/health/live" });
    expect(live.statusCode).toBe(200);

    await shutdown.begin("SIGTERM");

    const rejected = await app.inject({ method: "GET", url: "/health/live" });
    expect(rejected.statusCode).toBe(503);
    expect(rejected.json()).toEqual({
      status: "shutting_down",
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: expect.any(String),
      },
    });

    await app.close();
  });
});
