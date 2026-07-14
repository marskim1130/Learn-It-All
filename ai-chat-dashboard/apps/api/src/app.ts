import Fastify from "fastify";

import { hashPassword, verifyPassword } from "./auth/password.js";
import {
  createMemoryUserRepository,
  EmailAlreadyExistsError,
  type UserRepository,
} from "./auth/users.js";
import {
  createMemoryConversationRepository,
  type ConversationRepository,
} from "./conversations/repository.js";
import {
  createEchoChatModelProvider,
  type ChatModelProvider,
} from "./chat/provider.js";
import {
  createMemoryMessageRepository,
  type Message,
  type MessageRepository,
} from "./messages/repository.js";

interface AppDependencies {
  database: {
    checkConnection(): Promise<boolean>;
  };
  users?: UserRepository;
  conversations?: ConversationRepository;
  messages?: MessageRepository;
  chatModel?: ChatModelProvider;
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
  const conversations =
    dependencies?.conversations ?? createMemoryConversationRepository();
  const messages = dependencies?.messages ?? createMemoryMessageRepository();
  const chatModel = dependencies?.chatModel ?? createEchoChatModelProvider();
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
    const user = await resolveCurrentUser(request.headers.cookie, sessions, users);
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

  /**
   * 为当前登录用户创建聊天会话。
   *
   * @example
   * const response = await app.inject({
   *   method: "POST",
   *   url: "/conversations",
   *   headers: { cookie: "access_token=<token>" },
   *   payload: { title: "学习计划" },
   * });
   * // 201 -> { conversation: { id, title, createdAt, updatedAt } }
   */
  app.post("/conversations", async (request, reply) => {
    const user = await resolveCurrentUser(request.headers.cookie, sessions, users);
    if (!user) {
      return reply.status(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "未登录或会话已失效",
        },
      });
    }

    const body = request.body as { title?: string };
    const title =
      typeof body.title === "string" && body.title.trim().length > 0
        ? body.title.trim()
        : "新会话";

    const conversation = await conversations.create({
      ownerId: user.id,
      title,
    });

    return reply.status(201).send({
      conversation: {
        id: conversation.id,
        title: conversation.title,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
      },
    });
  });

  /**
   * 列出当前登录用户的聊天会话。
   *
   * @example
   * const response = await app.inject({
   *   method: "GET",
   *   url: "/conversations",
   *   headers: { cookie: "access_token=<token>" },
   * });
   */
  app.get("/conversations", async (request, reply) => {
    const user = await resolveCurrentUser(request.headers.cookie, sessions, users);
    if (!user) {
      return reply.status(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "未登录或会话已失效",
        },
      });
    }

    const items = await conversations.listByOwner(user.id);
    return {
      conversations: items.map((item) => ({
        id: item.id,
        title: item.title,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
    };
  });

  /**
   * 读取当前用户拥有的单个会话详情。
   *
   * @example
   * const response = await app.inject({
   *   method: "GET",
   *   url: "/conversations/<id>",
   *   headers: { cookie: "access_token=<token>" },
   * });
   */
  app.get("/conversations/:id", async (request, reply) => {
    const user = await resolveCurrentUser(request.headers.cookie, sessions, users);
    if (!user) {
      return reply.status(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "未登录或会话已失效",
        },
      });
    }

    const { id } = request.params as { id: string };
    const conversation = await conversations.findByIdForOwner(id, user.id);
    if (!conversation) {
      return reply.status(404).send({
        error: {
          code: "NOT_FOUND",
          message: "会话不存在",
        },
      });
    }

    return {
      conversation: {
        id: conversation.id,
        title: conversation.title,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
      },
    };
  });

  /**
   * 重命名当前用户拥有的会话。
   *
   * @example
   * const response = await app.inject({
   *   method: "PATCH",
   *   url: "/conversations/<id>",
   *   headers: { cookie: "access_token=<token>" },
   *   payload: { title: "新标题" },
   * });
   */
  app.patch("/conversations/:id", async (request, reply) => {
    const user = await resolveCurrentUser(request.headers.cookie, sessions, users);
    if (!user) {
      return reply.status(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "未登录或会话已失效",
        },
      });
    }

    const body = request.body as { title?: string };
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "请求参数无效",
          details: [
            {
              field: "title",
              message: "标题不能为空",
            },
          ],
        },
      });
    }

    const { id } = request.params as { id: string };
    const conversation = await conversations.renameForOwner(id, user.id, title);
    if (!conversation) {
      return reply.status(404).send({
        error: {
          code: "NOT_FOUND",
          message: "会话不存在",
        },
      });
    }

    return {
      conversation: {
        id: conversation.id,
        title: conversation.title,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
      },
    };
  });

  /**
   * 删除当前用户拥有的会话。
   *
   * @example
   * await app.inject({
   *   method: "DELETE",
   *   url: "/conversations/<id>",
   *   headers: { cookie: "access_token=<token>" },
   * });
   */
  app.delete("/conversations/:id", async (request, reply) => {
    const user = await resolveCurrentUser(request.headers.cookie, sessions, users);
    if (!user) {
      return reply.status(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "未登录或会话已失效",
        },
      });
    }

    const { id } = request.params as { id: string };
    const deleted = await conversations.deleteForOwner(id, user.id);
    if (!deleted) {
      return reply.status(404).send({
        error: {
          code: "NOT_FOUND",
          message: "会话不存在",
        },
      });
    }

    return reply.status(204).send();
  });

  /**
   * 读取当前用户会话内的消息历史。
   *
   * @example
   * const response = await app.inject({
   *   method: "GET",
   *   url: "/conversations/<id>/messages",
   *   headers: { cookie: "access_token=<token>" },
   * });
   */
  app.get("/conversations/:id/messages", async (request, reply) => {
    const user = await resolveCurrentUser(request.headers.cookie, sessions, users);
    if (!user) {
      return reply.status(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "未登录或会话已失效",
        },
      });
    }

    const { id: conversationId } = request.params as { id: string };
    const conversation = await conversations.findByIdForOwner(
      conversationId,
      user.id,
    );
    if (!conversation) {
      return reply.status(404).send({
        error: {
          code: "NOT_FOUND",
          message: "会话不存在",
        },
      });
    }

    const items = await messages.listByConversation(conversationId);
    return {
      messages: items.map((item) => toPublicMessage(item)),
    };
  });

  /**
   * 发送用户消息，并通过 SSE 流式返回助手回复。
   *
   * @example
   * const response = await app.inject({
   *   method: "POST",
   *   url: "/conversations/<id>/messages",
   *   headers: { cookie: "access_token=<token>" },
   *   payload: { content: "你好" },
   * });
   * // text/event-stream: message.user → started → delta* → completed
   */
  app.post("/conversations/:id/messages", async (request, reply) => {
    const user = await resolveCurrentUser(request.headers.cookie, sessions, users);
    if (!user) {
      return reply.status(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "未登录或会话已失效",
        },
      });
    }

    const body = request.body as { content?: string };
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "请求参数无效",
          details: [
            {
              field: "content",
              message: "消息内容不能为空",
            },
          ],
        },
      });
    }

    const { id: conversationId } = request.params as { id: string };
    const conversation = await conversations.findByIdForOwner(
      conversationId,
      user.id,
    );
    if (!conversation) {
      return reply.status(404).send({
        error: {
          code: "NOT_FOUND",
          message: "会话不存在",
        },
      });
    }

    const userMessage = await messages.create({
      conversationId,
      role: "user",
      content,
      status: "completed",
    });

    const assistantMessage = await messages.create({
      conversationId,
      role: "assistant",
      content: "",
      status: "generating",
    });

    const history = await messages.listByConversation(conversationId);
    const chunks: string[] = [];
    chunks.push(formatSseEvent("message.user", toPublicMessage(userMessage)));
    chunks.push(
      formatSseEvent("message.assistant.started", toPublicMessage(assistantMessage)),
    );

    let assistantContent = "";
    try {
      for await (const chunk of chatModel.stream({
        messages: history
          .filter((item) => item.status === "completed" || item.id === userMessage.id)
          .map((item) => ({
            role: item.role,
            content: item.content,
          })),
      })) {
        assistantContent += chunk.delta;
        chunks.push(
          formatSseEvent("message.assistant.delta", {
            id: assistantMessage.id,
            delta: chunk.delta,
          }),
        );
      }

      const completed =
        (await messages.update(assistantMessage.id, {
          content: assistantContent,
          status: "completed",
        })) ?? {
          ...assistantMessage,
          content: assistantContent,
          status: "completed" as const,
        };

      chunks.push(
        formatSseEvent("message.assistant.completed", toPublicMessage(completed)),
      );
    } catch {
      const failed =
        (await messages.update(assistantMessage.id, {
          content: assistantContent,
          status: "failed",
        })) ?? {
          ...assistantMessage,
          content: assistantContent,
          status: "failed" as const,
        };

      chunks.push(
        formatSseEvent("message.assistant.failed", {
          ...toPublicMessage(failed),
          message: "模型生成失败",
        }),
      );
    }

    return reply
      .status(200)
      .header("content-type", "text/event-stream; charset=utf-8")
      .header("cache-control", "no-cache")
      .send(chunks.join(""));
  });

  return app;
}

function toPublicMessage(message: Message) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    status: message.status,
    createdAt: message.createdAt.toISOString(),
  };
}

function formatSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function resolveCurrentUser(
  cookieHeader: string | undefined,
  sessions: Map<string, string>,
  users: UserRepository,
) {
  const accessToken = readAccessToken(cookieHeader);
  if (!accessToken) {
    return null;
  }

  const userId = sessions.get(accessToken);
  if (!userId) {
    return null;
  }

  return users.findById(userId);
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
