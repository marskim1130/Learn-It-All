# AI Chat Dashboard 产品需求文档

## 问题陈述 [Problem Statement]

当前能力主要集中于 React 页面开发，缺少浏览器交互、服务端 API、身份安全、数据库、缓存、后台任务、文件处理、模型流式调用与持续集成组成的完整工程链路 [End-to-End Engineering Workflow]。

本项目要在四周内交付一个范围受控、可运行、可演示的 AI Chat Dashboard，并把 TypeScript、React、Next.js、Node.js、PostgreSQL、Redis 与 GitHub Actions 放入真实业务场景中学习。

## 解决方案 [Solution]

使用 `pnpm workspace` 单体仓库 [Monorepo]，包含 Next.js Web、Fastify API、BullMQ Worker、共享类型、数据库和工程配置。用户可以注册登录、管理多个聊天会话、接收模型流式回复、管理带变量的 Prompt 模板，并上传单个文本附件作为模型上下文。

第一版只支持 OpenAI 兼容接口 [OpenAI-Compatible API]，通过薄提供商适配层 [Provider Adapter] 隔离模型调用。PostgreSQL 负责持久化，Redis 负责限流和任务队列，GitHub Actions 负责持续集成 [Continuous Integration, CI]。

## 用户故事 [User Stories]

1. 作为访客，我希望使用邮箱和密码注册，以便创建自己的聊天空间。
2. 作为注册用户，我希望登录、保持登录并安全退出，以便管理身份会话。
3. 作为登录用户，我希望其他用户无法访问我的数据，以便保护个人内容。
4. 作为登录用户，我希望创建、查看、重命名和删除多个会话，以便整理不同主题。
5. 作为登录用户，我希望发送文本消息并逐步看到模型输出，以便无需等待完整响应。
6. 作为登录用户，我希望看到生成中、完成和失败状态，以便理解请求进度并从故障恢复。
7. 作为登录用户，我希望历史消息按顺序显示，长会话仍保持流畅，以便继续上下文。
8. 作为登录用户，我希望创建、查看、编辑和删除私有 Prompt 模板，以便复用常用指令。
9. 作为登录用户，我希望模板支持 `{{variable}}` 占位符和必填校验，以便安全生成最终 Prompt。
10. 作为登录用户，我希望消息记录模板来源，以便追踪内容如何生成。
11. 作为登录用户，我希望筛选模板时界面保持响应，以便快速选择模板。
12. 作为登录用户，我希望上传一个文本或 Markdown 文件，以便将内容加入模型上下文。
13. 作为登录用户，我希望不合法附件被明确拒绝，附件失败后仍可发送纯文本。
14. 作为登录用户，我希望首条消息后自动生成会话标题，失败时不影响聊天。
15. 作为开发者，我希望模型提供商可以替换，以便切换 OpenAI、Ollama 等兼容服务。
16. 作为开发者，我希望持续集成不调用真实模型，以便测试稳定且不产生外部费用。
17. 作为开发者，我希望通过真实 PostgreSQL 验证约束、事务和数据隔离。
18. 作为开发者，我希望观察 HTTP、事件循环 [Event Loop]、流 [Streams] 与背压 [Backpressure]。
19. 作为开发者，我希望观察索引、查询计划、连接池、Redis 过期时间 [TTL] 与队列状态。
20. 作为开发者，我希望服务支持健康检查 [Health Check] 和优雅关闭 [Graceful Shutdown]。
21. 作为开发者，我希望每个功能记录设计理由、替代方案与可运行示例，以便沉淀知识。
22. 作为开发者，我希望本地依赖可由 Docker Compose 启动，以便复现实验环境。

## 核心行为优先级 [Behavior Priorities]

### P0：必须完成

- 邮箱密码注册、登录、退出与用户数据隔离。
- 会话和消息核心 CRUD。
- OpenAI 兼容模型调用与服务器发送事件 [Server-Sent Events, SSE] 流式输出。
- PostgreSQL 持久化、约束和迁移。
- Prompt 模板私有 CRUD、变量校验、渲染与来源追踪。
- 关键 API 集成测试、一条端到端核心旅程和基础 CI。

### P1：应当完成

- 单个文本或 Markdown 附件上传。
- Redis 登录限流和 BullMQ 自动生成会话标题。
- React 并发能力、长列表虚拟化 [Virtualization] 与性能测量。
- 基础深色主题、响应式与无障碍 [Accessibility]。

### P2：时间允许时完善

- 更完整的错误恢复界面和系统实验。
- Docker 镜像构建，但不包含实际云端部署。

## 实现决策 [Implementation Decisions]

### 仓库与模块

- 应用模块为 Web、API、Worker；共享模块为 shared、database、config。
- Node.js 使用长期支持版本 [Long-Term Support, LTS] 并固定版本。
- PostgreSQL 与 Redis 由 Docker Compose 启动，应用进程在本机运行以便调试。

### 前端

- 使用 Next.js App Router；服务器组件 [Server Components] 获取适合服务端处理的首屏数据，交互区域进入最小客户端边界 [Client Boundary]。
- TanStack Query 管理服务端状态 [Server State]，Zustand 管理少量跨组件界面状态 [UI State]，React Hook Form 与 Zod 管理表单和共享校验。
- 当前会话 ID 使用 URL 状态，例如 `/chat/:conversationId`。
- `useTransition` 用于会话切换，`useDeferredValue` 用于模板筛选。
- 优化前先用 React Profiler 测量；长消息列表使用虚拟化，流式文本批量刷新。
- 使用 Tailwind CSS 与 shadcn/ui，功能优先、桌面优先，并保证基本移动端可用。

### API 与鉴权

- 使用 Fastify；密码使用 Argon2 哈希 [Password Hashing]。
- 后端签发短期访问令牌 [Access Token]，通过 `HttpOnly`、`Secure`、`SameSite=Lax` Cookie 传递。
- 第一版不使用第三方身份服务。
- 资源查询同时约束资源 ID 与当前用户 ID，授权 [Authorization] 不依赖前端隐藏。
- 输入输出由共享模式 [Schema] 做运行时校验，并从模式推导 TypeScript 类型。

### 数据模型

- `users`：用户标识、邮箱、密码摘要、时间戳。
- `conversations`：所有者、标题、时间戳。
- `messages`：会话、角色、正文、状态、模板来源、附件元数据、时间戳。
- `prompt_templates`：所有者、名称、描述、正文、标签、时间戳。
- 刷新令牌 [Refresh Token] 是否持久化在鉴权切片中决定，不提前建表。
- 主键使用 UUID；删除会话时数据库级联删除消息。
- 使用 Drizzle ORM 定义模式和迁移，同时在学习记录中展示 SQL 与查询计划。

### 模型与流式协议

- 第一版只实现 OpenAI 兼容接口，业务层仅依赖 `ChatModelProvider` 抽象。
- 提供商通过异步可迭代对象 [Async Iterable] 返回文本分片；密钥仅存在后端环境变量。
- 浏览器与 API 使用 SSE；流开始前保存用户消息，助手消息具有生成中、完成、失败状态。
- 客户端中断时取消上游请求或停止消费，避免无效资源消耗。

### Prompt、附件与队列

- Prompt 模板属于单个用户，支持名称、描述、正文、标签和双花括号变量。
- 服务端负责变量提取、校验和最终渲染；数据库保存最终文本和模板 ID。
- 每条消息最多一个纯文本或 Markdown 附件，使用 `multipart/form-data`，最大 `1 MB`。
- PostgreSQL 只保存附件元数据；本地文件进入受控临时目录；上传失败不阻断纯文本发送。
- Redis 保存登录限流计数与过期时间；BullMQ 在首条消息后生成会话标题。
- Worker 独立运行，采用有限重试 [Bounded Retry]，最终失败只记录日志。

### API 契约 [API Contracts]

- 鉴权：注册、登录、退出、查询当前用户。
- 会话：列表、创建、读取、重命名、删除。
- 消息：读取会话消息、发送消息并建立 SSE 流。
- Prompt 模板：列表、创建、读取、更新、删除、解析变量。
- 附件：随发送消息流程接收，不提供独立公共文件浏览接口。
- 健康检查：存活状态与依赖就绪状态。
- 错误响应包含稳定机器错误码、用户消息和可选字段错误详情。
- 具体 URL、状态码与模式在对应垂直切片 [Vertical Slice] 中冻结并由契约测试保护。

### TypeScript 学习设计

- 泛型 [Generics] 用于结果类型、分页结构、模型流和可复用表单，但不为展示技术而抽象。
- 类型推导 [Type Inference] 优先来自 Zod、Drizzle 和函数返回值，避免重复声明。
- 工具类型 [Utility Types] 用于安全变换公开契约，并记录过度使用的风险。
- shared 只导出跨应用稳定契约，不导出应用内部实现类型。

## 可测试性设计 [Design for Testability]

### 测试接缝 [Testing Seams]

1. **浏览器核心旅程**：从用户可见行为验证注册登录、创建会话、发送消息和接收流式回复。
2. **公共 HTTP 接口**：通过 Fastify 注入或真实 HTTP 验证鉴权、授权、错误码与 SSE，不测试控制器内部结构。
3. **真实数据库边界**：在隔离 PostgreSQL 中运行迁移和集成测试，验证约束、事务、级联删除和数据隔离，不模拟仓储层。
4. **模型提供商边界**：确定性假提供商 [Fake Provider] 输出可控分片、错误和延迟，CI 不调用真实外部模型。
5. **队列边界**：使用隔离 Redis 验证入队、消费、重试和幂等结果，不依赖 BullMQ 内部实现。
6. **文件输入边界**：通过 multipart 请求验证类型、大小、解析和失败降级。

### 测试原则

- 测试外部行为与领域不变量 [Domain Invariants]，不锁定内部函数结构。
- 每个切片覆盖一条成功路径、一个最高风险失败路径和必要的数据隔离行为。
- 不追求穷举所有边缘情况 [Edge Cases] 或覆盖率数字。
- 流式测试验证事件顺序、最终持久化状态和中断清理，不依赖具体分片大小。
- UI 测试聚焦用户行为、加载、错误和键盘可达性，不测试 CSS 细节。
- 实现阶段严格执行一次一个测试的红-绿-重构循环 [Red-Green-Refactor Loop]。

### 关键测试

- 注册、登录、退出和错误凭据。
- 用户不能访问其他用户的会话、消息和模板。
- 会话删除级联删除消息。
- 发送消息产生有序 SSE 事件并保存最终助手消息。
- 模型失败或客户端中断后的状态和资源清理正确。
- 模板变量可提取、校验和渲染，缺失变量被拒绝。
- 不合法附件被拒绝，附件失败后仍可发送纯文本。
- 首条消息只触发预期标题任务，重试不会造成破坏性重复更新。
- 端到端测试覆盖“注册登录 → 创建会话 → 发送消息 → 接收流式回复”。

## 四周里程碑 [Milestones]

1. **第一周：工程骨架与鉴权**——Monorepo、Web、API、PostgreSQL、注册登录、Cookie 鉴权和基础 CI。
2. **第二周：聊天核心链路**——会话、消息、模型适配层、SSE、多会话界面和关键集成测试。
3. **第三周：Prompt 与附件**——模板 CRUD、变量表单、来源追踪、文本附件和 React 性能测量。
4. **第四周：异步任务与工程加固**——Redis、BullMQ、Worker、端到端测试、日志、健康检查、优雅关闭和文档。

## 完成定义 [Definition of Done]

- 垂直切片可运行、可演示并通过相关测试。
- 公开 API 具有 JSDoc 与可运行示例 [Example]。
- 用户可见功能具有教学型 HTML Demo；Next.js 页面可作为载体，但必须包含功能介绍、API、设计思想、核心语法、常见错误和可运行示例。
- README、API 文档、示例、学习记录和架构决策同步更新。
- 教学内容遵循“为什么 [Why] → 是什么 [What] → 怎么做 [How] → 完整示例 [Complete Example]”。
- `work.md` 记录每次落盘修改与撤回方式 [Rollback Strategy]。
- 不引入与当前追踪子弹无关的推测性代码 [Speculative Code]。

## 非目标 [Out of Scope]

- 复杂智能体 [Agent]、工具调用、检索增强生成 [RAG] 和长期记忆。
- OAuth、邮箱验证、找回密码和多因素认证 [MFA]。
- 多个非兼容模型厂商、WebSocket、语音、图片、PDF 和多模态。
- 模板版本、公开分享、市场和团队协作。
- 消息缓存、分布式锁 [Distributed Lock] 和复杂事件系统。
- 云对象存储、生产域名、HTTPS 和正式云端持续部署 [Continuous Deployment, CD]。
- 原创品牌、复杂动画和穷举全部边缘场景或浏览器组合。

## 进一步说明 [Further Notes]

- PRD 确认后使用 `/to-issues` 拆成独立垂直切片，禁止前端、后端、数据库水平分层 [Horizontal Slicing]。
- 具体实现使用 `/tdd`，每次只处理一个追踪子弹 [Tracer Bullet]。
- 本月以本地完整链路和持续集成为验收目标，不以正式云部署为条件。
