import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";

describe("GET /health/live", () => {
  it("返回 API 进程存活状态", async () => {
    const app = buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/health/live",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });

    await app.close();
  });
});

describe("GET /health/ready", () => {
  it("数据库不可用时返回服务未就绪", async () => {
    const app = buildApp({
      database: {
        checkConnection: async () => false,
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/health/ready",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: "not_ready",
      dependencies: {
        database: "unavailable",
      },
    });

    await app.close();
  });

  it("数据库可用时返回服务已就绪", async () => {
    const app = buildApp({
      database: {
        checkConnection: async () => true,
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/health/ready",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ready",
      dependencies: {
        database: "available",
      },
    });

    await app.close();
  });
});
