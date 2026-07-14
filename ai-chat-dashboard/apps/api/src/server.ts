import { createDatabase, readDatabaseConfig } from "@ai-chat-dashboard/database";

import { buildApp } from "./app.js";
import { resolveLoginRateLimiter } from "./auth/redis.js";
import { createDatabaseUserRepository } from "./auth/users.js";
import { resolveChatModelProvider } from "./chat/config.js";
import { createDatabaseConversationRepository } from "./conversations/repository.js";
import { resolveTitleQueue } from "./jobs/resolve-title-queue.js";
import { createDatabaseMessageRepository } from "./messages/repository.js";
import { createStructuredLogger } from "./observability/logging.js";
import { createShutdownController } from "./observability/shutdown.js";
import { createDatabasePromptTemplateRepository } from "./prompt-templates/repository.js";

const port = Number(process.env.API_PORT ?? 3001);
const host = process.env.API_HOST ?? "0.0.0.0";
const logger = createStructuredLogger({ service: "api" });
const shutdown = createShutdownController({ logger });

const database = createDatabase(readDatabaseConfig());
const chatModel = resolveChatModelProvider(process.env);
const { limiter: loginRateLimiter, close: closeRateLimiter } =
  await resolveLoginRateLimiter(process.env);
const { queue: titleQueue, close: closeTitleQueue } = await resolveTitleQueue(
  process.env,
);

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
  conversations: createDatabaseConversationRepository(database),
  messages: createDatabaseMessageRepository(database),
  promptTemplates: createDatabasePromptTemplateRepository(database),
  chatModel,
  loginRateLimiter,
  titleQueue,
  logger,
  shutdown,
});

app.addHook("onClose", async () => {
  await database.close();
  if (closeRateLimiter) {
    await closeRateLimiter();
  }
  if (closeTitleQueue) {
    await closeTitleQueue();
  }
});

shutdown.onShutdown(async () => {
  await app.close();
});

function handleSignal(signal: string) {
  void shutdown.begin(signal).finally(() => {
    process.exit(0);
  });
}

process.on("SIGINT", () => handleSignal("SIGINT"));
process.on("SIGTERM", () => handleSignal("SIGTERM"));

try {
  await app.listen({ host, port });
  logger.info("api_started", { host, port });
} catch (error) {
  logger.error("api_start_failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
}
