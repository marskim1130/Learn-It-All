# Issue 015：完整用户旅程学习记录

## 为什么 [Why]

切片各自通过，不等于整条链路可演示。需要一条不依赖外网的核心旅程测试，把注册、登录、会话、模板消息、附件消息、流式回复和标题任务串起来，并让 CI 提供隔离 PostgreSQL/Redis。

## 是什么 [What]

- `apps/api/test/core-journey.e2e.test.ts`：API 级端到端旅程（假模型）。
- CI：PostgreSQL + Redis service containers，`CHAT_PROVIDER=echo`。
- `docs/RUNBOOK.md`：干净环境启动与验收清单。

## 怎么做 [How]

1. 内存仓储 + echo 提供商构建 `buildApp`。
2. 顺序执行：register → login → me → conversation → template → stream message → title job → attachment message → history。
3. CI 注入 `DATABASE_URL`/`REDIS_URL`，迁移后跑全量测试。

## 完整示例 [Complete Example]

```powershell
cd ai-chat-dashboard
pnpm test -- apps/api/test/core-journey.e2e.test.ts
# 或按 RUNBOOK 从零启动
```

常见错误：

- E2E 打真实 OpenAI，导致 CI 不稳定与费用。
- CI 只有 Postgres 没有 Redis，后台任务路径无法覆盖。
- 缺少运行手册，干净机器无法复现。
