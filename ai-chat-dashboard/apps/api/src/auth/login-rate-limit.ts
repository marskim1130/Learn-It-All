export const LOGIN_RATE_LIMIT_MAX_FAILURES = 5;
export const LOGIN_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;

export interface LoginRateLimitDecision {
  limited: boolean;
  retryAfterSeconds: number;
  count: number;
  key: string;
}

export interface LoginRateLimiter {
  /**
   * 登录前检查是否已超限。
   */
  check(email: string): Promise<LoginRateLimitDecision>;
  /**
   * 记录一次失败尝试；返回是否因此进入限流。
   */
  registerFailure(email: string): Promise<LoginRateLimitDecision>;
  /**
   * 成功登录后清除失败计数。
   */
  clear(email: string): Promise<void>;
  /**
   * 限流键：仅基于规范化邮箱，不含密码。
   */
  keyFor(email: string): string;
}

export interface RedisLike {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  ttl(key: string): Promise<number>;
  del(...keys: string[]): Promise<unknown>;
  get(key: string): Promise<string | null>;
}

/**
 * 规范化邮箱并生成限流键。键中不得出现密码等敏感凭据。
 */
export function loginRateLimitKey(email: string): string {
  return `login:fail:${email.trim().toLowerCase()}`;
}

/**
 * 内存登录限流器 [In-Memory Rate Limiter]，模拟 Redis 计数 + TTL。
 * 用于测试与无 Redis 的本地/CI 环境。
 *
 * @example
 * const limiter = createMemoryLoginRateLimiter({ now: () => Date.now() });
 * await limiter.registerFailure("alice@example.com");
 */
export function createMemoryLoginRateLimiter(options?: {
  now?: () => number;
  maxFailures?: number;
  windowSeconds?: number;
}): LoginRateLimiter {
  const now = options?.now ?? Date.now;
  const maxFailures = options?.maxFailures ?? LOGIN_RATE_LIMIT_MAX_FAILURES;
  const windowSeconds =
    options?.windowSeconds ?? LOGIN_RATE_LIMIT_WINDOW_SECONDS;
  const records = new Map<string, { count: number; expiresAt: number }>();

  function keyFor(email: string): string {
    return loginRateLimitKey(email);
  }

  function read(key: string): { count: number; expiresAt: number } | null {
    const current = records.get(key);
    if (!current) {
      return null;
    }
    if (current.expiresAt <= now()) {
      records.delete(key);
      return null;
    }
    return current;
  }

  function decision(
    key: string,
    count: number,
    expiresAt: number,
  ): LoginRateLimitDecision {
    const retryAfterSeconds = Math.max(
      0,
      Math.ceil((expiresAt - now()) / 1000),
    );
    return {
      limited: count >= maxFailures,
      retryAfterSeconds,
      count,
      key,
    };
  }

  return {
    keyFor,
    async check(email) {
      const key = keyFor(email);
      const current = read(key);
      if (!current) {
        return { limited: false, retryAfterSeconds: 0, count: 0, key };
      }
      return decision(key, current.count, current.expiresAt);
    },
    async registerFailure(email) {
      const key = keyFor(email);
      const current = read(key);
      if (!current) {
        const expiresAt = now() + windowSeconds * 1000;
        records.set(key, { count: 1, expiresAt });
        return decision(key, 1, expiresAt);
      }
      const next = { count: current.count + 1, expiresAt: current.expiresAt };
      records.set(key, next);
      return decision(key, next.count, next.expiresAt);
    },
    async clear(email) {
      records.delete(keyFor(email));
    },
  };
}

/**
 * 基于 Redis 的登录限流器：INCR + EXPIRE + TTL。
 *
 * @example
 * const limiter = createRedisLoginRateLimiter(redisClient);
 */
export function createRedisLoginRateLimiter(
  redis: RedisLike,
  options?: {
    maxFailures?: number;
    windowSeconds?: number;
  },
): LoginRateLimiter {
  const maxFailures = options?.maxFailures ?? LOGIN_RATE_LIMIT_MAX_FAILURES;
  const windowSeconds =
    options?.windowSeconds ?? LOGIN_RATE_LIMIT_WINDOW_SECONDS;

  function keyFor(email: string): string {
    return loginRateLimitKey(email);
  }

  async function decisionFromRedis(
    key: string,
    count: number,
  ): Promise<LoginRateLimitDecision> {
    const ttl = await redis.ttl(key);
    const retryAfterSeconds = ttl > 0 ? ttl : windowSeconds;
    return {
      limited: count >= maxFailures,
      retryAfterSeconds,
      count,
      key,
    };
  }

  return {
    keyFor,
    async check(email) {
      const key = keyFor(email);
      const raw = await redis.get(key);
      const count = raw ? Number(raw) : 0;
      if (!raw || Number.isNaN(count) || count <= 0) {
        return { limited: false, retryAfterSeconds: 0, count: 0, key };
      }
      return decisionFromRedis(key, count);
    },
    async registerFailure(email) {
      const key = keyFor(email);
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }
      return decisionFromRedis(key, count);
    },
    async clear(email) {
      await redis.del(keyFor(email));
    },
  };
}
