import { describe, expect, it } from "vitest";

import { createSessionSwitchController } from "../lib/session-switch";

describe("createSessionSwitchController", () => {
  it("切换会话时标记 pending，输入草稿仍可编辑", () => {
    const controller = createSessionSwitchController({
      initialConversationId: "c1",
      initialDraft: "正在输入",
    });

    expect(controller.getState()).toEqual({
      conversationId: "c1",
      draft: "正在输入",
      isPending: false,
    });

    controller.beginSwitch("c2");
    expect(controller.getState().isPending).toBe(true);
    expect(controller.getState().conversationId).toBe("c1");

    // 切换未完成时输入仍可更新
    controller.setDraft("继续打字");
    expect(controller.getState().draft).toBe("继续打字");
    expect(controller.getState().isPending).toBe(true);

    controller.completeSwitch();
    expect(controller.getState()).toEqual({
      conversationId: "c2",
      draft: "",
      isPending: false,
    });
  });
});
