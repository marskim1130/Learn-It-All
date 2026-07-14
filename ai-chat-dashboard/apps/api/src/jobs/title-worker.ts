import type { ConversationRepository } from "../conversations/repository.js";
import {
  DEFAULT_CONVERSATION_TITLE,
  generateTitleFromSeed,
  type TitleJob,
} from "./title-queue.js";

/**
 * 处理标题任务：仅当会话仍是默认标题时更新，保证重试幂等。
 *
 * @example
 * await processTitleJob(job, conversations);
 */
export async function processTitleJob(
  job: TitleJob,
  conversations: ConversationRepository,
): Promise<{ updated: boolean; title?: string }> {
  const conversation = await conversations.findByIdForOwner(
    job.conversationId,
    job.ownerId,
  );
  if (!conversation) {
    return { updated: false };
  }

  // 用户已手改标题，或先前任务已成功：跳过，避免破坏性覆盖
  if (conversation.title.trim() !== DEFAULT_CONVERSATION_TITLE) {
    return { updated: false };
  }

  const title = generateTitleFromSeed(job.seedText);
  if (title === DEFAULT_CONVERSATION_TITLE) {
    return { updated: false };
  }

  const updated = await conversations.renameForOwner(
    job.conversationId,
    job.ownerId,
    title,
  );

  return updated ? { updated: true, title } : { updated: false };
}
