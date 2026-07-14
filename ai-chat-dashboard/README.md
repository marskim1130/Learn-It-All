# AI Chat Dashboard

一个用于补齐 TypeScript、React、Next.js、Node.js、PostgreSQL、Redis 与持续集成 [Continuous Integration, CI] 能力的教学型全栈项目。

当前进度：

- Issue 001：工程骨架已建立（Next.js Web、Fastify API、PostgreSQL、Docker Compose、CI）。
- Issue 002：用户注册 API 已完成（Argon2 密码摘要、邮箱唯一约束、稳定错误码）。
- Issue 003：登录与身份会话已完成（HttpOnly Cookie、当前用户、退出失效）。
- Issue 004：聊天会话创建/列表/详情已完成（按用户隔离，跨用户 404）。
- Issue 005：会话重命名与删除已完成（owner 隔离，删除 204）。
- Issue 006：消息发送与模拟 SSE 流已完成（假提供商、状态机、级联删除）。
- Issue 007：OpenAI 兼容提供商已接入（默认 echo，可切真实兼容 API）。
- Issue 008：聊天性能实验台已完成（批量流式、TanStack 虚拟列表、切换 pending）。
- Issue 009：Prompt 模板 CRUD 与筛选已完成（私有隔离、tags、q 搜索）。
- Issue 010：模板变量提取/渲染与消息来源追踪已完成。
- Issue 011：消息文本/Markdown 附件上传与元数据追踪已完成。

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
- 聊天性能实验台：`http://localhost:3000/chat`
- API：`http://localhost:3001`
- 存活检查：`http://localhost:3001/health/live`
- 就绪检查：`http://localhost:3001/health/ready`
- 用户注册：`POST http://localhost:3001/auth/register`
- 登录：`POST http://localhost:3001/auth/login`
- 当前身份：`GET http://localhost:3001/auth/me`
- 退出：`POST http://localhost:3001/auth/logout`
- 会话列表：`GET http://localhost:3001/conversations`
- 创建会话：`POST http://localhost:3001/conversations`
- 会话详情：`GET http://localhost:3001/conversations/:id`
- 重命名会话：`PATCH http://localhost:3001/conversations/:id`
- 删除会话：`DELETE http://localhost:3001/conversations/:id`
- 发送消息（SSE）：`POST http://localhost:3001/conversations/:id/messages`
- 消息历史：`GET http://localhost:3001/conversations/:id/messages`
- Prompt 模板：`/prompt-templates`（POST/GET/PATCH/DELETE，支持 `?q=`）
- 模板变量：`GET /prompt-templates/:id/variables`
- 带模板发消息：`POST /conversations/:id/messages`（`promptTemplateId` + `variables`）
- 带附件发消息：`POST /conversations/:id/messages`（`multipart/form-data`，字段 `file`，`.txt/.md` ≤1MB）

### 模型提供商

默认 `CHAT_PROVIDER=echo`（本地回显，CI 安全）。切换 OpenAI 兼容服务时：

```env
CHAT_PROVIDER=openai
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

Ollama 示例：`OPENAI_BASE_URL=http://127.0.0.1:11434/v1`，`OPENAI_API_KEY=ollama`。密钥仅服务端使用，禁止 `NEXT_PUBLIC_*`。

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

$created = Invoke-RestMethod -Method Post -Uri http://localhost:3001/conversations `
  -ContentType "application/json" `
  -Body '{"title":"学习计划"}' `
  -WebSession $session
Invoke-RestMethod -Uri http://localhost:3001/conversations -WebSession $session
Invoke-RestMethod -Uri "http://localhost:3001/conversations/$($created.conversation.id)" `
  -WebSession $session

Invoke-RestMethod -Method Patch `
  -Uri "http://localhost:3001/conversations/$($created.conversation.id)" `
  -ContentType "application/json" `
  -Body '{"title":"更新后的标题"}' `
  -WebSession $session

Invoke-WebRequest -Method Delete `
  -Uri "http://localhost:3001/conversations/$($created.conversation.id)" `
  -WebSession $session

Invoke-WebRequest -Method Post -Uri http://localhost:3001/auth/logout -WebSession $session
```

注册成功返回 `201`；登录成功返回 `200` 并设置 `HttpOnly` Cookie；错误凭据返回 `401 INVALID_CREDENTIALS`；未认证访问 `/auth/me` 返回 `401 UNAUTHORIZED`。创建会话返回 `201`；列表与详情只包含当前用户数据；跨用户详情返回 `404 NOT_FOUND`。重命名返回 `200` 且详情立即可见；删除返回 `204`，列表与详情不再包含该会话。

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

按照 `docs/issues/README.md` 从 Issue 012 限制登录请求频率继续实现。
