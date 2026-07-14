import Fastify from "fastify";

import {
  createMemoryLoginRateLimiter,
  type LoginRateLimiter,
} from "./auth/login-rate-limit.js";
import { hashPassword, verifyPassword } from "./auth/password.js";
import {
  createAuthSession,
  createMemorySessionStore,
  type AuthSession,
  type SessionStore,
} from "./auth/session.js";
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
  ChatTurnError,
  createChatTurnModule,
  Utterance,
} from "./chat-turn/index.js";
import { bufferChatTurnAsSse } from "./chat-turn/sse.js";
import {
  AttachmentValidationError,
  parseTextAttachment,
  type ParsedAttachment,
} from "./messages/attachments.js";
import {
  createMemoryMessageRepository,
  type Message,
  type MessageRepository,
} from "./messages/repository.js";
import {
  createMemoryPromptTemplateRepository,
  type PromptTemplate,
  type PromptTemplateRepository,
} from "./prompt-templates/repository.js";
import { extractTemplateVariables } from "./prompt-templates/variables.js";
import {
  createNoopTitleQueue,
  type ConversationTitleQueue,
} from "./jobs/title-queue.js";
import {
  createRequestId,
  createStructuredLogger,
  type StructuredLogger,
} from "./observability/logging.js";
import {
  createShutdownController,
  type ShutdownController,
} from "./observability/shutdown.js";

interface AppDependencies {
  database: {
    checkConnection(): Promise<boolean>;
  };
  users?: UserRepository;
  conversations?: ConversationRepository;
  messages?: MessageRepository;
  promptTemplates?: PromptTemplateRepository;
  chatModel?: ChatModelProvider;
  loginRateLimiter?: LoginRateLimiter;
  titleQueue?: ConversationTitleQueue;
  sessionStore?: SessionStore;
  authSession?: AuthSession;
  logger?: StructuredLogger;
  shutdown?: ShutdownController;
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
  const app = Fastify({
    bodyLimit: 2 * 1024 * 1024,
  });
  // multipart 以原始字符串解析，便于测试 inject 与教学演示
  app.addContentTypeParser(
    "multipart/form-data",
    { parseAs: "string" },
    (_request, body, done) => {
      done(null, body);
    },
  );

  const users = dependencies?.users ?? createMemoryUserRepository();
  const conversations =
    dependencies?.conversations ?? createMemoryConversationRepository();
  const messages = dependencies?.messages ?? createMemoryMessageRepository();
  const promptTemplates =
    dependencies?.promptTemplates ?? createMemoryPromptTemplateRepository();
  const chatModel = dependencies?.chatModel ?? createEchoChatModelProvider();
  const loginRateLimiter =
    dependencies?.loginRateLimiter ?? createMemoryLoginRateLimiter();
  const titleQueue = dependencies?.titleQueue ?? createNoopTitleQueue();
  const sessionStore =
    dependencies?.sessionStore ?? createMemorySessionStore();
  const authSession =
    dependencies?.authSession ??
    createAuthSession({
      users,
      store: sessionStore,
    });
  const chatTurn = createChatTurnModule({
    conversations,
    messages,
    promptTemplates,
    chatModel,
    titleQueue,
  });
  const logger = dependencies?.logger ?? createStructuredLogger({ service: "api" });
  const shutdown =
    dependencies?.shutdown ?? createShutdownController({ logger });

  app.addHook("onRequest", async (request, reply) => {
    const incoming = request.headers["x-request-id"];
    const requestId =
      typeof incoming === "string" && incoming.trim().length > 0
        ? incoming.trim()
        : createRequestId();
    (request as { requestId?: string }).requestId = requestId;
    reply.header("x-request-id", requestId);

    if (shutdown.isShuttingDown) {
      return reply.status(503).send({
        status: "shutting_down",
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "服务正在关闭，请稍后重试",
        },
      });
    }
  });

  app.addHook("onResponse", async (request, reply) => {
    const requestId = (request as { requestId?: string }).requestId;
    logger.info("http_request", {
      requestId,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
    });
  });

  app.get("/health/live", async () => ({ status: "ok" }));

  app.get("/health/ready", async (_request, reply) => {
    if (shutdown.isShuttingDown) {
      return reply.status(503).send({
        status: "not_ready",
        dependencies: {
          database: "draining",
        },
      });
    }

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

    const precheck = await loginRateLimiter.check(email);
    if (precheck.limited) {
      return reply.status(429).send({
        error: {
          code: "TOO_MANY_REQUESTS",
          message: "登录尝试过于频繁，请稍后再试",
          retryAfterSeconds: precheck.retryAfterSeconds,
        },
      });
    }

    const user = await users.findByEmail(email);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      // 本次失败仍返回 401；达到阈值后的后续请求由 precheck 返回 429
      await loginRateLimiter.registerFailure(email);
      return reply.status(401).send({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "邮箱或密码不正确",
        },
      });
    }

    await loginRateLimiter.clear(email);

    const session = await authSession.createSession(user.id);
    reply.header("set-cookie", session.setCookieHeader);

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
    const user = await authSession.resolveUser(request.headers.cookie);
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
    const revoked = await authSession.revokeSession(request.headers.cookie);
    reply.header("set-cookie", revoked.clearCookieHeader);
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
    const user = await authSession.resolveUser(request.headers.cookie);
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
    const user = await authSession.resolveUser(request.headers.cookie);
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
    const user = await authSession.resolveUser(request.headers.cookie);
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
    const user = await authSession.resolveUser(request.headers.cookie);
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
    const user = await authSession.resolveUser(request.headers.cookie);
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
    const user = await authSession.resolveUser(request.headers.cookie);
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
    const user = await authSession.resolveUser(request.headers.cookie);
    if (!user) {
      return reply.status(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "未登录或会话已失效",
        },
      });
    }

    const { id: conversationId } = request.params as { id: string };

    let content = "";
    let promptTemplateId: string | null = null;
    let variables: Record<string, string> = {};
    let attachment: ParsedAttachment | null = null;

    const contentType = String(request.headers["content-type"] ?? "");
    if (contentType.includes("multipart/form-data")) {
      try {
        const parsed = await parseMultipartMessageRequest(request);
        content = parsed.content;
        promptTemplateId = parsed.promptTemplateId;
        variables = parsed.variables;
        attachment = parsed.attachment;
      } catch (error) {
        if (error instanceof AttachmentValidationError) {
          return reply.status(400).send({
            error: {
              code: "VALIDATION_ERROR",
              message: "请求参数无效",
              details: [{ field: error.field, message: error.message }],
            },
          });
        }
        throw error;
      }
    } else {
      const body = request.body as {
        content?: string;
        promptTemplateId?: string;
        variables?: Record<string, string>;
      };
      content = typeof body.content === "string" ? body.content.trim() : "";
      promptTemplateId =
        typeof body.promptTemplateId === "string" ? body.promptTemplateId : null;
      variables =
        body.variables && typeof body.variables === "object" ? body.variables : {};
    }

    let utterance = promptTemplateId
      ? Utterance.template(promptTemplateId, variables)
      : Utterance.plain(content);
    if (attachment) {
      utterance = Utterance.withAttachment(utterance, attachment);
    }

    try {
      const body = await bufferChatTurnAsSse(
        chatTurn.stream(
          { ownerId: user.id, conversationId },
          utterance,
        ),
      );

      return reply
        .status(200)
        .header("content-type", "text/event-stream; charset=utf-8")
        .header("cache-control", "no-cache")
        .send(body);
    } catch (error) {
      if (error instanceof ChatTurnError) {
        if (
          error.code === "CONVERSATION_NOT_FOUND" ||
          error.code === "PROMPT_TEMPLATE_NOT_FOUND"
        ) {
          return reply.status(404).send({
            error: {
              code: "NOT_FOUND",
              message: error.message,
            },
          });
        }

        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "请求参数无效",
            details: error.details ?? [
              { field: "content", message: error.message },
            ],
          },
        });
      }
      throw error;
    }
  });
  /**
   * 提取 Prompt 模板中的双花括号变量。
   */
  app.get("/prompt-templates/:id/variables", async (request, reply) => {
    const user = await authSession.resolveUser(request.headers.cookie);
    if (!user) {
      return reply.status(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "未登录或会话已失效",
        },
      });
    }

    const { id } = request.params as { id: string };
    const template = await promptTemplates.findByIdForOwner(id, user.id);
    if (!template) {
      return reply.status(404).send({
        error: {
          code: "NOT_FOUND",
          message: "模板不存在",
        },
      });
    }

    return {
      variables: extractTemplateVariables(template.body),
    };
  });

  /**
   * 创建当前用户的 Prompt 模板。
   *
   * @example
   * const response = await app.inject({
   *   method: "POST",
   *   url: "/prompt-templates",
   *   headers: { cookie: "access_token=<token>" },
   *   payload: {
   *     name: "代码审查",
   *     description: "审查 PR",
   *     body: "请审查以下代码",
   *     tags: ["code"],
   *   },
   * });
   */
  app.post("/prompt-templates", async (request, reply) => {
    const user = await authSession.resolveUser(request.headers.cookie);
    if (!user) {
      return reply.status(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "未登录或会话已失效",
        },
      });
    }

    const body = request.body as {
      name?: string;
      description?: string;
      body?: string;
      tags?: string[];
    };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const templateBody = typeof body.body === "string" ? body.body.trim() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    const tags = Array.isArray(body.tags)
      ? body.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean)
      : [];

    if (!name) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "请求参数无效",
          details: [{ field: "name", message: "名称不能为空" }],
        },
      });
    }
    if (!templateBody) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "请求参数无效",
          details: [{ field: "body", message: "正文不能为空" }],
        },
      });
    }

    const template = await promptTemplates.create({
      ownerId: user.id,
      name,
      description,
      body: templateBody,
      tags,
    });

    return reply.status(201).send({
      promptTemplate: toPublicPromptTemplate(template),
    });
  });

  /**
   * 列出当前用户的 Prompt 模板，支持 q 子串筛选。
   */
  app.get("/prompt-templates", async (request, reply) => {
    const user = await authSession.resolveUser(request.headers.cookie);
    if (!user) {
      return reply.status(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "未登录或会话已失效",
        },
      });
    }

    const query = request.query as { q?: string };
    const items = await promptTemplates.listByOwner(user.id, query.q ?? "");
    return {
      promptTemplates: items.map((item) => toPublicPromptTemplate(item)),
    };
  });

  /**
   * 读取当前用户的单个 Prompt 模板。
   */
  app.get("/prompt-templates/:id", async (request, reply) => {
    const user = await authSession.resolveUser(request.headers.cookie);
    if (!user) {
      return reply.status(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "未登录或会话已失效",
        },
      });
    }

    const { id } = request.params as { id: string };
    const template = await promptTemplates.findByIdForOwner(id, user.id);
    if (!template) {
      return reply.status(404).send({
        error: {
          code: "NOT_FOUND",
          message: "模板不存在",
        },
      });
    }

    return {
      promptTemplate: toPublicPromptTemplate(template),
    };
  });

  /**
   * 更新当前用户的 Prompt 模板。
   */
  app.patch("/prompt-templates/:id", async (request, reply) => {
    const user = await authSession.resolveUser(request.headers.cookie);
    if (!user) {
      return reply.status(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "未登录或会话已失效",
        },
      });
    }

    const body = request.body as {
      name?: string;
      description?: string;
      body?: string;
      tags?: string[];
    };

    const patch: {
      name?: string;
      description?: string;
      body?: string;
      tags?: string[];
    } = {};

    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "请求参数无效",
            details: [{ field: "name", message: "名称不能为空" }],
          },
        });
      }
      patch.name = name;
    }
    if (body.body !== undefined) {
      const templateBody = typeof body.body === "string" ? body.body.trim() : "";
      if (!templateBody) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "请求参数无效",
            details: [{ field: "body", message: "正文不能为空" }],
          },
        });
      }
      patch.body = templateBody;
    }
    if (body.description !== undefined) {
      patch.description =
        typeof body.description === "string" ? body.description.trim() : "";
    }
    if (body.tags !== undefined) {
      patch.tags = Array.isArray(body.tags)
        ? body.tags
            .filter((tag): tag is string => typeof tag === "string")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : [];
    }

    const { id } = request.params as { id: string };
    const template = await promptTemplates.updateForOwner(id, user.id, patch);
    if (!template) {
      return reply.status(404).send({
        error: {
          code: "NOT_FOUND",
          message: "模板不存在",
        },
      });
    }

    return {
      promptTemplate: toPublicPromptTemplate(template),
    };
  });

  /**
   * 删除当前用户的 Prompt 模板。
   */
  app.delete("/prompt-templates/:id", async (request, reply) => {
    const user = await authSession.resolveUser(request.headers.cookie);
    if (!user) {
      return reply.status(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "未登录或会话已失效",
        },
      });
    }

    const { id } = request.params as { id: string };
    const deleted = await promptTemplates.deleteForOwner(id, user.id);
    if (!deleted) {
      return reply.status(404).send({
        error: {
          code: "NOT_FOUND",
          message: "模板不存在",
        },
      });
    }

    return reply.status(204).send();
  });

  return app;
}

function toPublicPromptTemplate(template: PromptTemplate) {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    body: template.body,
    tags: template.tags,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  };
}

function toPublicMessage(message: Message) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    status: message.status,
    promptTemplateId: message.promptTemplateId,
    attachment: message.attachment,
    createdAt: message.createdAt.toISOString(),
  };
}

async function parseMultipartMessageRequest(request: {
  headers: Record<string, unknown>;
  body?: unknown;
}): Promise<{
  content: string;
  promptTemplateId: string | null;
  variables: Record<string, string>;
  attachment: ParsedAttachment | null;
}> {
  const contentType = String(request.headers["content-type"] ?? "");
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];
  if (!boundary) {
    throw new AttachmentValidationError("file", "multipart boundary 无效");
  }

  const rawBody =
    typeof request.body === "string"
      ? request.body
      : Buffer.isBuffer(request.body)
        ? request.body.toString("utf8")
        : "";
  if (!rawBody) {
    throw new AttachmentValidationError("file", "multipart 请求体为空");
  }

  let content = "";
  let promptTemplateId: string | null = null;
  let variables: Record<string, string> = {};
  let attachment: ParsedAttachment | null = null;
  let fileCount = 0;

  const parts = rawBody.split(`--${boundary}`);
  for (const rawPart of parts) {
    const part = rawPart.replace(/^\r?\n/, "").replace(/\r?\n--\r?\n?$/, "").replace(/--\r?\n?$/, "");
    if (!part || part === "--" || part === "--\r\n") {
      continue;
    }

    const separatorIndex = part.search(/\r?\n\r?\n/);
    if (separatorIndex < 0) {
      continue;
    }

    const headerText = part.slice(0, separatorIndex);
    let bodyText = part.slice(separatorIndex).replace(/^\r?\n\r?\n/, "");
    bodyText = bodyText.replace(/\r?\n$/, "");

    const disposition = /content-disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]*)")?/i.exec(
      headerText,
    );
    if (!disposition) {
      continue;
    }

    const fieldName = disposition[1] ?? "";
    const fileName = disposition[2];
    if (fileName !== undefined) {
      fileCount += 1;
      if (fileCount > 1) {
        throw new AttachmentValidationError("file", "每条消息最多一个附件");
      }
      const mimeMatch = /content-type:\s*([^\r\n]+)/i.exec(headerText);
      const mimeType = mimeMatch?.[1]?.trim();
      attachment = parseTextAttachment({
        fileName: fileName || "attachment.txt",
        ...(mimeType ? { mimeType } : {}),
        content: bodyText,
      });
      continue;
    }

    const value = bodyText.trim();
    if (fieldName === "content") {
      content = value;
    } else if (fieldName === "promptTemplateId") {
      promptTemplateId = value || null;
    } else if (fieldName === "variables") {
      try {
        const parsed = JSON.parse(value || "{}") as Record<string, string>;
        if (parsed && typeof parsed === "object") {
          variables = parsed;
        }
      } catch {
        throw new AttachmentValidationError("variables", "variables 必须是 JSON 对象");
      }
    }
  }

  return { content, promptTemplateId, variables, attachment };
}
