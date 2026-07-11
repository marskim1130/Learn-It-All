# Issue 001：工程骨架学习记录

## 为什么 [Why]

存活检查 [Liveness Check] 只回答进程是否可响应；就绪检查 [Readiness Check] 还要验证 PostgreSQL 等关键依赖，避免把流量发送给无法工作的实例。

## 是什么 [What]

- Fastify 应用工厂 [Application Factory] 通过依赖注入形成测试接缝 [Testing Seam]。
- Drizzle 负责类型安全数据库访问，`postgres` 负责连接池。
- Next.js 服务器组件 [Server Component] 在服务端读取健康接口，不向浏览器暴露内部 API 配置。
- Docker Compose 使用健康检查和数据卷 [Volume] 管理本地 PostgreSQL。
- GitHub Actions 启动真实 PostgreSQL、执行迁移，再运行测试。

## 怎么做 [How]

1. `/health/live` 不访问数据库，始终快速返回进程状态。
2. `/health/ready` 调用数据库连接检查，成功返回 `200`，失败返回 `503`。
3. Web 使用 `cache: "no-store"` 获取两个状态并分别展示。
4. 测试通过 Fastify `inject()` 和可替换 `fetch` 验证公共行为。

## 完整示例 [Complete Example]

```powershell
Copy-Item .env.example .env
docker compose up -d postgres
pnpm db:migrate
pnpm dev
Invoke-RestMethod http://localhost:3001/health/live
Invoke-RestMethod http://localhost:3001/health/ready
```

常见错误：未启动 PostgreSQL 时存活检查仍应成功，但就绪检查应返回 `503`。
