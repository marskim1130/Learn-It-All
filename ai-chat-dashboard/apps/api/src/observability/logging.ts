const SENSITIVE_KEY_PATTERN =
  /(password|passwd|secret|token|authorization|api[_-]?key|cookie|access_token|refresh_token)/i;

export interface StructuredLogger {
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

/**
 * 生成请求/任务关联 ID [Correlation ID]。
 */
export function createRequestId(): string {
  return crypto.randomUUID();
}

/**
 * 递归脱敏日志字段，过滤密码、令牌与密钥。
 *
 * @example
 * redactSensitive({ password: "x", email: "a@b.com" });
 * // => { password: "[REDACTED]", email: "a@b.com" }
 */
export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item));
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = redactSensitive(nested);
      }
    }
    return result;
  }

  return value;
}

/**
 * 创建结构化日志器；输出 JSON 行并自动脱敏。
 */
export function createStructuredLogger(
  options: {
    service?: string;
    write?: (line: string) => void;
  } = {},
): StructuredLogger {
  const service = options.service ?? "api";
  const write = options.write ?? ((line: string) => console.log(line));

  function log(
    level: "info" | "warn" | "error",
    message: string,
    fields: Record<string, unknown> = {},
  ) {
    const entry = {
      level,
      service,
      message,
      time: new Date().toISOString(),
      ...(redactSensitive(fields) as Record<string, unknown>),
    };
    write(JSON.stringify(entry));
  }

  return {
    info: (message, fields) => log("info", message, fields),
    warn: (message, fields) => log("warn", message, fields),
    error: (message, fields) => log("error", message, fields),
  };
}
