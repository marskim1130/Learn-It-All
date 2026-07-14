"use client";

import { useMemo, useState, useTransition } from "react";

import { createStreamTextBatcher } from "../lib/batch-stream-text";
import { MessageList, type ChatMessageItem } from "./message-list";

function buildMessages(count: number, conversationId: string): ChatMessageItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${conversationId}-${index}`,
    role: index % 2 === 0 ? "user" : "assistant",
    content: `会话 ${conversationId} 的消息 #${index + 1}`,
  }));
}

/**
 * 聊天性能实验台：演示会话切换 useTransition、长列表虚拟化与流式批量刷新。
 */
export function ChatPerformanceLab() {
  const [conversationId, setConversationId] = useState("c1");
  const [draft, setDraft] = useState("");
  const [streamText, setStreamText] = useState("");
  const [flushCount, setFlushCount] = useState(0);
  const [isPending, startTransition] = useTransition();

  const messages = useMemo(
    () => buildMessages(500, conversationId),
    [conversationId],
  );

  function switchConversation(nextId: string) {
    startTransition(() => {
      setConversationId(nextId);
      setDraft("");
      setStreamText("");
      setFlushCount(0);
    });
  }

  function simulateStream() {
    const batcher = createStreamTextBatcher({
      intervalMs: 50,
      onFlush: (text) => {
        setStreamText(text);
        setFlushCount((count) => count + 1);
      },
    });

    const chunks = ["这", "是", "一", "段", "流", "式", "回", "复"];
    for (const chunk of chunks) {
      batcher.append(chunk);
    }

    window.setTimeout(() => {
      batcher.flush();
      batcher.dispose();
    }, 80);
  }

  return (
    <section style={{ display: "grid", gap: 16, maxWidth: 720 }}>
      <header>
        <h1>聊天性能实验台</h1>
        <p>
          优化前基线假设：每条 SSE 分片都 setState、整表渲染 500+ 消息、会话切换同步阻塞输入。
        </p>
      </header>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={() => switchConversation("c1")}>
          会话 C1
        </button>
        <button type="button" onClick={() => switchConversation("c2")}>
          会话 C2
        </button>
        <button type="button" onClick={simulateStream}>
          模拟流式分片
        </button>
      </div>

      <p data-testid="pending-state">
        当前会话：{conversationId}
        {isPending ? "（切换中 isPending）" : ""}
      </p>

      <label>
        输入草稿（切换 pending 时仍可编辑）
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          style={{ display: "block", width: "100%", marginTop: 4 }}
          data-testid="draft-input"
        />
      </label>

      <MessageList messages={messages} />

      <div>
        <h2>批量流式文本</h2>
        <p data-testid="stream-text">{streamText || "（尚未模拟）"}</p>
        <small data-testid="flush-count">flush 次数：{flushCount}</small>
      </div>
    </section>
  );
}
