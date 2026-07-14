import type { StructuredLogger } from "./logging.js";

export interface ShutdownController {
  readonly isShuttingDown: boolean;
  begin(reason: string): Promise<void>;
  onShutdown(handler: () => Promise<void> | void): void;
}

/**
 * 优雅关闭控制器：标记停机状态并串行执行清理钩子。
 *
 * @example
 * const shutdown = createShutdownController({ logger });
 * shutdown.onShutdown(async () => app.close());
 * process.on("SIGTERM", () => void shutdown.begin("SIGTERM"));
 */
export function createShutdownController(options: {
  logger?: StructuredLogger;
}): ShutdownController {
  let isShuttingDown = false;
  const handlers: Array<() => Promise<void> | void> = [];
  let closing: Promise<void> | undefined;

  return {
    get isShuttingDown() {
      return isShuttingDown;
    },
    onShutdown(handler) {
      handlers.push(handler);
    },
    async begin(reason) {
      if (closing) {
        return closing;
      }

      isShuttingDown = true;
      options.logger?.info("shutdown_started", { reason });

      closing = (async () => {
        for (const handler of handlers) {
          await handler();
        }
        options.logger?.info("shutdown_completed", { reason });
      })();

      return closing;
    },
  };
}
