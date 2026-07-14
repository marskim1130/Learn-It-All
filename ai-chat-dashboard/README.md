# AI Chat Dashboard

一个用于补齐 TypeScript、React、Next.js、Node.js、PostgreSQL、Redis 与持续集成 [Continuous Integration, CI] 能力的教学型全栈项目。

当前进度：

- Issue 001：工程骨架已建立（Next.js Web、Fastify API、PostgreSQL、Docker Compose、CI）。
- Issue 002：用户注册 API 已完成（Argon2 密码摘要、邮箱唯一约束、稳定错误码）。
- Issue 003：登录与身份会话已完成（HttpOnly Cookie、当前用户、退出失效）。

## 环境要求

- Node.js 22 或更高版本。
- pnpm 10.33.2。
- Docker，用于本地 PostgreSQL；默认凭据仅限开发环境，禁止用于生产。

## 本地启动

```powershell
Copy-Item .env.example .env
pnpm install
docker compose up -d postgres
pnpm db:migrate
pnpm dev
```

- Web：`http://localhost:3000`
- API：`http://localhost:3001`
- 存活检查：`http://localhost:3001/health/live`
- 就绪检查：`http://localhost:3001/health/ready`
- 用户注册：`POST http://localhost:3001/auth/register`
- 登录：`POST http://localhost:3001/auth/login`
- 当前身份：`GET http://localhost:3001/auth/me`
- 退出：`POST http://localhost:3001/auth/logout`

### 注册与登录示例

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3001/auth/register `
  -ContentType "application/json" `
  -Body '{"email":"alice@example.com","password":"password123"}'

$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Invoke-RestMethod -Method Post -Uri http://localhost:3001/auth/login `
  -ContentType "application/json" `
  -Body '{"email":"alice@example.com","password":"password123"}' `
  -WebSession $session

Invoke-RestMethod -Uri http://localhost:3001/auth/me -WebSession $session
Invoke-WebRequest -Method Post -Uri http://localhost:3001/auth/logout -WebSession $session
```

注册成功返回 `201`；登录成功返回 `200` 并设置 `HttpOnly` Cookie；错误凭据返回 `401 INVALID_CREDENTIALS`；未认证访问 `/auth/me` 返回 `401 UNAUTHORIZED`。

若未安装 Docker，可以运行不依赖真实 PostgreSQL 的测试，但数据库集成测试会被跳过。

## 质量检查

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## 当前文档

- 产品需求：`docs/PRD.md`
- 架构决策：`docs/decisions/0001-foundation.md`
- 学习记录索引：`docs/learning/README.md`
- 修改审计：`work.md`

## 下一步

按照 `docs/issues/README.md` 从 Issue 004 创建并查看聊天会话继续实现。
