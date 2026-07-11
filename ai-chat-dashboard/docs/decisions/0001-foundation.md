# ADR-0001：AI Chat Dashboard 基础架构

- 状态：已接受
- 日期：2026-07-11

## 背景 [Context]

项目要通过可运行产品学习完整工程链路 [End-to-End Engineering Workflow]，架构必须显式呈现前后端、数据持久化、模型流和后台任务边界，同时控制复杂智能体 [Agent] 与部署范围。

## 决策 [Decision]

- 使用 `pnpm workspace` 单体仓库 [Monorepo]。
- 使用 Next.js App Router、Fastify、Drizzle ORM、PostgreSQL、Redis 与 BullMQ。
- 使用 OpenAI 兼容接口、薄提供商适配层 [Provider Adapter] 与服务器发送事件 [SSE]。
- 使用邮箱密码、Argon2 与安全 Cookie 实现第一方鉴权。
- 使用 TanStack Query、Zustand、React Hook Form 与 Zod 划分状态职责。
- 使用 Docker Compose 管理本地数据依赖，使用 GitHub Actions 完成持续集成 [CI]。

## 后果 [Consequences]

- 获得独立 Node.js 服务、真实 HTTP 边界、数据库和队列学习价值。
- 需要处理跨应用开发、Cookie、SSE 中断、数据状态和测试环境复杂度。

## 被拒绝方案 [Rejected Alternatives]

- 全部放入 Next.js：降低独立后端学习价值。
- Express：可行，但 Fastify 更适合本项目的模式校验、插件边界与 TypeScript 目标。
- 直接 SQL：选择 Drizzle 以保留 SQL 可见性并减少迁移样板。
- 多模型厂商与 WebSocket：超出第一版必要范围。
- Redux 管理全部状态：会模糊服务端、URL、表单和界面状态所有权。

## 撤回方式 [Rollback Strategy]

业务实现前可删除本 ADR 并修改 PRD；实现开始后必须新增 ADR 替代，不重写历史决策。
