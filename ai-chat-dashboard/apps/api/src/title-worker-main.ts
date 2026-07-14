import { Worker } from "bullmq";
import { createDatabase, readDatabaseConfig } from "@ai-chat-dashboard/database";

import { createDatabaseConversationRepository } from "./conversations/repository.js";
import { TITLE_QUEUE_NAME } from "./jobs/bullmq-title-queue.js";
import type { TitleJob } from "./jobs/title-queue.js";
import { processTitleJob } from "./jobs/title-worker.js";

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

const database = createDatabase(readDatabaseConfig());
const conversations = createDatabaseConversationRepository(database);

const worker = new Worker<TitleJob>(
  TITLE_QUEUE_NAME,
  async (job) => processTitleJob(job.data, conversations),
  {
    connection: { url: redisUrl },
  },
);

worker.on("completed", (job, result) => {
  console.log(
    JSON.stringify({
      event: "title_job_completed",
      jobId: job.id,
      conversationId: job.data.conversationId,
      result,
    }),
  );
});

worker.on("failed", (job, error) => {
  console.error(
    JSON.stringify({
      event: "title_job_failed",
      jobId: job?.id,
      conversationId: job?.data.conversationId,
      error: error.message,
    }),
  );
});

async function shutdown() {
  await worker.close();
  await database.close();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});

console.log(
  JSON.stringify({
    event: "title_worker_started",
    queue: TITLE_QUEUE_NAME,
  }),
);
