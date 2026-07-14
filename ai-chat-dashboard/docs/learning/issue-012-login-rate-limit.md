# Issue 012：登录限流学习记录

## 为什么 [Why]

登录接口暴露在公网时，暴力猜密码是最高频攻击之一。限流 [Rate Limiting] 应只统计失败尝试，键中不得出现密码；TTL [Time To Live] 到期后自动恢复，避免永久锁死正常用户。

## 是什么 [What]

- 维度：规范化邮箱 `login:fail:{email}`
- 阈值：15 分钟内最多 5 次失败
- 超限：`429 TOO_MANY_REQUESTS` + `retryAfterSeconds`
- 成功登录：清除失败计数
- 实现：
  - 内存限流器（测试 / 无 Redis）
  - Redis 限流器（`INCR` + `EXPIRE` + `TTL`）

## 怎么做 [How]

1. 登录前 `check(email)`，已超限直接 429。
2. 凭据错误时 `registerFailure(email)`，本次仍返回 401。
3. 达到阈值后的下一次请求由 `check` 返回 429。
4. 登录成功 `clear(email)`。
5. Redis 不可用或未配置时降级内存实现。

## 完整示例 [Complete Example]

```powershell
docker compose up -d redis
# .env 中 REDIS_URL=redis://127.0.0.1:6379

# 连续错误密码 5 次 -> 401
# 第 6 次 -> 429 TOO_MANY_REQUESTS
# 等待 TTL 后可再试；正确密码成功后计数清零
```

常见错误：

- 把密码写进 Redis 键或值。
- 成功与失败共用计数，导致正常用户被锁。
- 无 TTL，用户永久无法登录。
