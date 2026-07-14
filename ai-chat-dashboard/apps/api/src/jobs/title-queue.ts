export const DEFAULT_CONVERSATION_TITLE = "新会话";

export interface TitleJob {
  conversationId: string;
  ownerId: string;
  seedText: string;
}

/**
 * 会话标题任务队列 [Title Queue]。
 * 生产可用 BullMQ；测试使用内存实现。
 */
export interface ConversationTitleQueue {
  enqueue(job: TitleJob): Promise<void>;
}

export interface MemoryConversationTitleQueue extends ConversationTitleQueue {
  readonly jobs: TitleJob[];
  drain(): TitleJob[];
}

/**
 * 内存标题队列，便于契约测试断言入队内容。
 *
 * @example
 * const queue = createMemoryTitleQueue();
 * await queue.enqueue({ conversationId: "c1", ownerId: "u1", seedText: "你好" });
 * expect(queue.jobs).toHaveLength(1);
 */
export function createMemoryTitleQueue(): MemoryConversationTitleQueue {
  const jobs: TitleJob[] = [];

  return {
    jobs,
    async enqueue(job) {
      jobs.push({
        conversationId: job.conversationId,
        ownerId: job.ownerId,
        seedText: job.seedText,
      });
    },
    drain() {
      return jobs.splice(0, jobs.length);
    },
  };
}

/**
 * 空队列：入队即忽略，用于无 Redis 时的安全降级。
 */
export function createNoopTitleQueue(): ConversationTitleQueue {
  return {
    async enqueue() {
      // 无后台队列时不阻断聊天
    },
  };
}

/**
 * 由首条用户消息生成确定性短标题（教学向，测试稳定）。
 *
 * @example
 * generateTitleFromSeed("请帮我复习 TypeScript 泛型");
 * // => "请帮我复习 TypeScript 泛型"
 */
export function generateTitleFromSeed(seedText: string, maxLength = 30): string {
  const normalized = seedText.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return DEFAULT_CONVERSATION_TITLE;
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

/**
 * 是否应在首条消息后入队标题任务。
 */
export function shouldEnqueueTitleJob(input: {
  conversationTitle: string;
  userMessageCount: number;
}): boolean {
  return (
    input.userMessageCount === 1 &&
    input.conversationTitle.trim() === DEFAULT_CONVERSATION_TITLE
  );
}
