import Fastify from "fastify";

import { hashPassword, verifyPassword } from "./auth/password.js";
import {
  createMemoryUserRepository,
  EmailAlreadyExistsError,
  type UserRepository,
} from "./auth/users.js";

interface AppDependencies {
  database: {
    checkConnection(): Promise<boolean>;
  };
  users?: UserRepository;
}

/**
 * 创建 API 应用实例。
 *
 * @example
 * const app = buildApp({
 *   database: { checkConnection: async () => true },
 * });
 * const response = await app.inject({ method: "GET", url: "/health/live" });
 * await app.close();
 */
export function buildApp(dependencies?: AppDependencies) {
  const app = Fastify();
  const users = dependencies?.users ?? createMemoryUserRepository();
  /** 进程内会话表：access_token -> userId。退出时删除条目使旧令牌失效。 */
  const sessions = new Map<string, string>();

  app.get("/health/live", async () => ({ status: "ok" }));

  app.get("/health/ready", async (_request, reply) => {
    const databaseAvailable = await dependencies?.database.checkConnection();

    if (!databaseAvailable) {
      return reply.status(503).send({
        status: "not_ready",
        dependencies: {
          database: "unavailable",
        },
      });
    }

    return {
      status: "ready",
      dependencies: {
        database: "available",
      },
    };
  });

  /**
   * 注册新用户。
   *
   * @example
   * const response = await app.inject({
   *   method: "POST",
   *   url: "/auth/register",
   *   payload: { email: "alice@example.com", password: "password123" },
   * });
   * // 201 -> { user: { id, email, createdAt } }
   */
  app.post("/auth/register", async (request, reply) => {
    const body = request.body as { email?: string; password?: string };
    const email = body.email ?? "";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "请求参数无效",
          details: [
            {
              field: "email",
              message: "邮箱格式无效",
            },
          ],
        },
      });
    }

    const password = body.password ?? "";
    if (password.length < 8) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "请求参数无效",
          details: [
            {
              field: "password",
              message: "密码至少需要 8 个字符",
            },
          ],
        },
      });
    }

    const existing = await users.findByEmail(email);
    if (existing) {
      return reply.status(409).send({
        error: {
          code: "EMAIL_ALREADY_EXISTS",
          message: "该邮箱已被注册",
        },
      });
    }

    try {
      const user = await users.create({
        email,
        passwordHash: await hashPassword(password),
      });

      return reply.status(201).send({
        user: {
          id: user.id,
          email: user.email,
          createdAt: user.createdAt.toISOString(),
        },
      });
    } catch (error) {
      if (error instanceof EmailAlreadyExistsError) {
        return reply.status(409).send({
          error: {
            code: "EMAIL_ALREADY_EXISTS",
            message: "该邮箱已被注册",
          },
        });
      }
      throw error;
    }
  });

  /**
   * 使用邮箱密码登录，并写入 HttpOnly 访问令牌 Cookie。
   *
   * @example
   * const response = await app.inject({
   *   method: "POST",
   *   url: "/auth/login",
   *   payload: { email: "alice@example.com", password: "password123" },
   * });
   * // 200 -> { user: { id, email, createdAt } } + Set-Cookie: access_token=...
   */
  app.post("/auth/login", async (request, reply) => {
    const body = request.body as { email?: string; password?: string };
    const email = body.email ?? "";
    const password = body.password ?? "";

    const user = await users.findByEmail(email);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return reply.status(401).send({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "邮箱或密码不正确",
        },
      });
    }

    const accessToken = crypto.randomUUID();
    sessions.set(accessToken, user.id);

    reply.header(
      "set-cookie",
      `access_token=${accessToken}; HttpOnly; Path=/; SameSite=Lax`,
    );

    return reply.status(200).send({
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt.toISOString(),
      },
    });
  });

  /**
   * 根据访问令牌 Cookie 返回当前登录用户。
   *
   * @example
   * const response = await app.inject({
   *   method: "GET",
   *   url: "/auth/me",
   *   headers: { cookie: "access_token=<token>" },
   * });
   */
  app.get("/auth/me", async (request, reply) => {
    const accessToken = readAccessToken(request.headers.cookie);
    if (!accessToken) {
      return reply.status(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "未登录或会话已失效",
        },
      });
    }

    const userId = sessions.get(accessToken);
    if (!userId) {
      return reply.status(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "未登录或会话已失效",
        },
      });
    }

    const user = await users.findById(userId);
    if (!user) {
      return reply.status(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "未登录或会话已失效",
        },
      });
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt.toISOString(),
      },
    };
  });

  /**
   * 退出登录：清除 Cookie 并从会话表移除令牌，使旧 Cookie 立即失效。
   *
   * @example
   * await app.inject({
   *   method: "POST",
   *   url: "/auth/logout",
   *   headers: { cookie: "access_token=<token>" },
   * });
   */
  app.post("/auth/logout", async (request, reply) => {
    const accessToken = readAccessToken(request.headers.cookie);
    if (accessToken) {
      sessions.delete(accessToken);
    }

    reply.header(
      "set-cookie",
      "access_token=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0",
    );
    return reply.status(204).send();
  });

  return app;
}

function readAccessToken(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("access_token="))
    ?.slice("access_token=".length);
}
