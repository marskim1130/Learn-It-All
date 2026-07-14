import { Worker } from "bullmq";
import { createDatabase, readDatabaseConfig } from "@ai-chat-dashboard/database";

import { createDatabaseConversationRepository } from "./conversations/repository.js";
import { TITLE_QUEUE_NAME } from "./jobs/bullmq-title-queue.js";
import type { TitleJob } from "./jobs/title-queue.js";
import { processTitleJob } from "./jobs/title-worker.js";
import {
  createRequestId,
  createStructuredLogger,
  redactSensitive,
} from "./observability/logging.js";
import { createShutdownController } from "./observability/shutdown.js";

/**
 * 会话标题 Worker：消费 BullMQ 任务并幂等更新标题。
 *
 * @example
 * REDIS_URL=redis://127.0.0.1:6379 pnpm --filter @ai-chat-dashboard/api worker
 */
const redisUrl = process.env.REDIS_URL?.trim();
if (!redisUrl) {
  console.error("REDIS_URL is required for the title worker");
  process.exit(1);
}

const logger = createStructuredLogger({ service: "title-worker" });
const shutdown = createShutdownController({ logger });
const database = createDatabase(readDatabaseConfig());
const conversations = createDatabaseConversationRepository(database);

const worker = new Worker<TitleJob>(
  TITLE_QUEUE_NAME,
  async (job) => {
    const correlationId = createRequestId();
    logger.info("title_job_started", {
      correlationId,
      jobId: job.id,
      conversationId: job.data.conversationId,
      payload: redactSensitive(job.data),
    });

    const result = await processTitleJob(job.data, conversations);

    logger.info("title_job_completed", {
      correlationId,
      jobId: job.id,
      conversationId: job.data.conversationId,
      result,
    });

    return result;
  },
  {
    connection: { url: redisUrl },
  },
);

worker.on("failed", (job, error) => {
  logger.error("title_job_failed", {
    jobId: job?.id,
    conversationId: job?.data.conversationId,
    error: error.message,
    payload: redactSensitive(job?.data ?? {}),
  });
});

shutdown.onShutdown(async () => {
  await worker.close();
  await database.close();
});

function handleSignal(signal: string) {
  void shutdown.begin(signal).finally(() => {
    process.exit(0);
  });
}

process.on("SIGINT", () => handleSignal("SIGINT"));
process.on("SIGTERM", () => handleSignal("SIGTERM"));

logger.info("title_worker_started", {
  queue: TITLE_QUEUE_NAME,
});
