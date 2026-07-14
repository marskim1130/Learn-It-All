import { createBullMqTitleQueue } from "./bullmq-title-queue.js";
import {
  createNoopTitleQueue,
  type ConversationTitleQueue,
} from "./title-queue.js";

/**
 * 根据 REDIS_URL 选择标题队列实现。
 * 无 Redis 时使用 noop，保证聊天主路径可用。
 */
export async function resolveTitleQueue(
  environment: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): Promise<{ queue: ConversationTitleQueue; close?: () => Promise<void> }> {
  const redisUrl = environment.REDIS_URL?.trim();
  if (!redisUrl) {
    return { queue: createNoopTitleQueue() };
  }

  try {
    return createBullMqTitleQueue(redisUrl);
  } catch {
    return { queue: createNoopTitleQueue() };
  }
}
