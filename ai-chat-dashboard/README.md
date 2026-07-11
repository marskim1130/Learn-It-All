# AI Chat Dashboard

一个用于补齐 TypeScript、React、Next.js、Node.js、PostgreSQL、Redis 与持续集成 [Continuous Integration, CI] 能力的教学型全栈项目。

Issue 001 工程骨架已建立：Next.js Web、Fastify API、PostgreSQL 数据库包、Docker Compose 和基础持续集成 [Continuous Integration, CI]。

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

按照 `docs/issues/README.md` 从 Issue 002 用户注册继续实现。
