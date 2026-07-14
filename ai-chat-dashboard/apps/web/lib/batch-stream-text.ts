export interface StreamTextBatcherOptions {
  /** 合并窗口毫秒数；窗口内多次 append 只 flush 一次。 */
  intervalMs: number;
  onFlush: (text: string) => void;
  now?: () => number;
  schedule?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  cancel?: (handle: ReturnType<typeof setTimeout>) => void;
}

export interface StreamTextBatcher {
  append(delta: string): void;
  getText(): string;
  flush(): void;
  dispose(): void;
}

/**
 * 创建流式文本批量器 [Stream Text Batcher]。
 * 用于降低 SSE 分片导致的高频 setState。
 *
 * @example
 * const batcher = createStreamTextBatcher({
 *   intervalMs: 50,
 *   onFlush: (text) => setAssistantText(text),
 * });
 * batcher.append("你");
 * batcher.append("好");
 */
export function createStreamTextBatcher(
  options: StreamTextBatcherOptions,
): StreamTextBatcher {
  const schedule = options.schedule ?? setTimeout;
  const cancel = options.cancel ?? clearTimeout;

  let text = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  function flush() {
    if (timer !== undefined) {
      cancel(timer);
      timer = undefined;
    }
    options.onFlush(text);
  }

  function scheduleFlush() {
    if (timer !== undefined || disposed) {
      return;
    }
    timer = schedule(() => {
      timer = undefined;
      options.onFlush(text);
    }, options.intervalMs);
  }

  return {
    append(delta) {
      if (disposed || delta.length === 0) {
        return;
      }
      text += delta;
      scheduleFlush();
    },
    getText() {
      return text;
    },
    flush() {
      if (disposed) {
        return;
      }
      flush();
    },
    dispose() {
      disposed = true;
      if (timer !== undefined) {
        cancel(timer);
        timer = undefined;
      }
    },
  };
}
