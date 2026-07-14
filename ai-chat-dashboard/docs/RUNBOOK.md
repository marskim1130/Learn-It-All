# AI Chat Dashboard 运行手册

干净环境从零启动并验收的最短路径。

## 1. 环境要求

- Node.js 22+
- pnpm 10.33.2
- Docker Desktop（PostgreSQL + Redis）

## 2. 启动依赖

```powershell
cd ai-chat-dashboard
Copy-Item .env.example .env
pnpm install
docker compose up -d postgres redis
pnpm db:migrate
```

## 3. 启动应用

```powershell
# API + Web
pnpm dev

# 可选：标题 Worker（需要 REDIS_URL）
pnpm --filter @ai-chat-dashboard/api worker
```

- Web：http://localhost:3000
- 聊天性能实验台：http://localhost:3000/chat
- API：http://localhost:3001
- 存活：http://localhost:3001/health/live
- 就绪：http://localhost:3001/health/ready

## 4. 验收清单

1. `pnpm test` 通过（含核心旅程 e2e，假模型，无外网）。
2. `pnpm typecheck`、`pnpm build` 通过。
3. 手动路径：
   - 注册 / 登录
   - 创建会话
   - 发送消息并收到 SSE 流
   - 可选：模板变量、文本附件、登录限流、标题 Worker

## 5. CI 说明

GitHub Actions 使用隔离 PostgreSQL 与 Redis，默认 `CHAT_PROVIDER=echo`，不访问真实模型。

## 6. 常见问题

- 无 Docker：单元/行为测试可跑，数据库集成测试会跳过。
- 无 Redis：登录限流与标题队列降级为内存/noop，聊天主路径仍可用。
- 优雅关闭：对 API/Worker 发送 SIGINT/SIGTERM 后应拒绝新请求并释放连接。
