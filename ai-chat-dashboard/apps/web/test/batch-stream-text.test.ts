import { describe, expect, it, vi } from "vitest";

import { createStreamTextBatcher } from "../lib/batch-stream-text";

describe("createStreamTextBatcher", () => {
  it("在时间窗内合并多个 delta，只触发一次 flush", () => {
    vi.useFakeTimers();
    const flushes: string[] = [];
    const batcher = createStreamTextBatcher({
      intervalMs: 50,
      onFlush: (text) => {
        flushes.push(text);
      },
    });

    batcher.append("你");
    batcher.append("好");
    batcher.append("呀");

    expect(flushes).toEqual([]);

    vi.advanceTimersByTime(50);

    expect(flushes).toEqual(["你好呀"]);
    expect(batcher.getText()).toBe("你好呀");

    batcher.append("！");
    vi.advanceTimersByTime(50);
    expect(flushes).toEqual(["你好呀", "你好呀！"]);

    batcher.dispose();
    vi.useRealTimers();
  });
});
