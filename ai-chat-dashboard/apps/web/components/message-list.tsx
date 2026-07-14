"use client";

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

export interface ChatMessageItem {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface MessageListProps {
  messages: ChatMessageItem[];
  itemHeight?: number;
  height?: number;
}

/**
 * 基于 TanStack Virtual 的消息列表 [Virtualized Message List]。
 * 只渲染可视区附近的消息行，降低长会话 DOM 成本。
 *
 * @example
 * <MessageList messages={[{ id: "1", role: "user", content: "你好" }]} />
 */
export function MessageList({
  messages,
  itemHeight = 72,
  height = 360,
}: MessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => itemHeight,
    overscan: 6,
  });

  return (
    <div
      ref={parentRef}
      style={{
        height,
        overflow: "auto",
        border: "1px solid #ccc",
        borderRadius: 8,
      }}
      data-testid="message-list"
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((item) => {
          const message = messages[item.index];
          if (!message) {
            return null;
          }

          return (
            <div
              key={message.id}
              data-index={item.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: item.size,
                transform: `translateY(${item.start}px)`,
                padding: "8px 12px",
                boxSizing: "border-box",
                borderBottom: "1px solid #eee",
              }}
            >
              <strong>{message.role === "user" ? "用户" : "助手"}</strong>
              <div>{message.content}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
