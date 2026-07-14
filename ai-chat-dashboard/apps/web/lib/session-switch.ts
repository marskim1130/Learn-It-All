export interface SessionSwitchState {
  conversationId: string;
  draft: string;
  isPending: boolean;
}

export interface SessionSwitchController {
  getState(): SessionSwitchState;
  setDraft(draft: string): void;
  beginSwitch(nextConversationId: string): void;
  completeSwitch(): void;
}

/**
 * 会话切换控制器：模拟 useTransition 的 pending 语义。
 * pending 期间草稿仍可编辑，完成切换后清空草稿。
 *
 * @example
 * const controller = createSessionSwitchController({
 *   initialConversationId: "c1",
 *   initialDraft: "",
 * });
 * controller.beginSwitch("c2");
 * controller.setDraft("还在打字");
 * controller.completeSwitch();
 */
export function createSessionSwitchController(options: {
  initialConversationId: string;
  initialDraft?: string;
}): SessionSwitchController {
  let conversationId = options.initialConversationId;
  let draft = options.initialDraft ?? "";
  let isPending = false;
  let pendingConversationId: string | null = null;

  return {
    getState() {
      return {
        conversationId,
        draft,
        isPending,
      };
    },
    setDraft(nextDraft) {
      draft = nextDraft;
    },
    beginSwitch(nextConversationId) {
      if (nextConversationId === conversationId) {
        return;
      }
      isPending = true;
      pendingConversationId = nextConversationId;
    },
    completeSwitch() {
      if (!isPending || !pendingConversationId) {
        return;
      }
      conversationId = pendingConversationId;
      pendingConversationId = null;
      isPending = false;
      draft = "";
    },
  };
}
