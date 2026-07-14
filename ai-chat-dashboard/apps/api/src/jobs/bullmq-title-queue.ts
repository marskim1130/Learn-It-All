import { Queue } from "bullmq";

import type { ConversationTitleQueue, TitleJob } from "./title-queue.js";

export const TITLE_QUEUE_NAME = "conversation-title";

/**
 * 基于 BullMQ 的标题任务队列。
 *
 * @example
 * const queue = createBullMqTitleQueue(process.env.REDIS_URL!);
 * await queue.enqueue({ conversationId, ownerId, seedText });
 */
export function createBullMqTitleQueue(redisUrl: string): {
  queue: ConversationTitleQueue;
  close: () => Promise<void>;
} {
  const connection = { url: redisUrl };
  const queue = new Queue<TitleJob>(TITLE_QUEUE_NAME, { connection });

  return {
    queue: {
      async enqueue(job) {
        await queue.add(
          "generate-title",
          {
            conversationId: job.conversationId,
            ownerId: job.ownerId,
            seedText: job.seedText,
          },
          {
            // 同一会话去重，避免并发重复入队
            jobId: `title:${job.conversationId}`,
            removeOnComplete: 100,
            removeOnFail: 100,
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 1000,
            },
          },
        );
      },
    },
    close: async () => {
      await queue.close();
    },
  };
}
