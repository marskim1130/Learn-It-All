import {
  createMemoryLoginRateLimiter,
  createRedisLoginRateLimiter,
  type LoginRateLimiter,
  type RedisLike,
} from "./login-rate-limit.js";

/**
 * 根据环境选择登录限流器。
 * 有 REDIS_URL 时尝试连接 Redis；否则使用内存实现（CI/本地默认）。
 *
 * @example
 * const limiter = await resolveLoginRateLimiter(process.env);
 */
export async function resolveLoginRateLimiter(
  environment: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): Promise<{ limiter: LoginRateLimiter; close?: () => Promise<void> }> {
  const redisUrl = environment.REDIS_URL?.trim();
  if (!redisUrl) {
    return { limiter: createMemoryLoginRateLimiter() };
  }

  try {
    const redisModule = await import("redis");
    const client = redisModule.createClient({ url: redisUrl });
    client.on("error", () => {
      // 连接错误由调用方健康检查/日志处理；避免未监听导致进程崩溃
    });
    await client.connect();

    const redisLike: RedisLike = {
      incr: (key) => client.incr(key),
      expire: (key, seconds) => client.expire(key, seconds),
      ttl: (key) => client.ttl(key),
      del: (...keys) => client.del(keys),
      get: (key) => client.get(key),
    };

    return {
      limiter: createRedisLoginRateLimiter(redisLike),
      close: async () => {
        await client.quit();
      },
    };
  } catch {
    // Redis 不可用时降级内存，保证进程可启动
    return { limiter: createMemoryLoginRateLimiter() };
  }
}
