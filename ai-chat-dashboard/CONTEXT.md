# AI Chat Dashboard

教学型全栈聊天产品的领域语言。架构加深与测试命名以本文件为准。

## Language

### 身份与会话

**User**：
以邮箱注册、持有私有资源的账户。
_Avoid_: Account, Client

**Access Token**：
登录后写入 HttpOnly Cookie 的不透明会话令牌；服务端会话表可作废。
_Avoid_: JWT（本项目第一版会话不是 JWT）, Bearer header token

**Auth Session**：
登录身份在服务端的可作废映射（Access Token → User id），以及从 Cookie 解析当前 User 的领域能力。
_Avoid_: Login state, Cookie jar, JWT session

**Session Store**：
Auth Session 背后的令牌存储接缝；内存 Map 与未来 Redis 都是适配器。
_Avoid_: Cache, Token database

**Conversation**：
用户拥有的聊天容器，有标题；删除时级联清理消息。
_Avoid_: Chat room, Thread, Session（Session 专指登录会话）

**Default Conversation Title**：
新建会话的占位标题，固定为「新会话」；首条消息后可由后台任务改写，用户手改后不再覆盖。
_Avoid_: Untitled, New chat

### 消息与回合

**Message**：
Conversation 内一条持久化发言，含 role、content、status，以及可选的模板来源与附件元数据。
_Avoid_: Chat item, Record

**Chat Turn**：
一次用户输入触发的完整领域编排：解析表达 → 持久化用户消息 → 可选标题入队 → 创建助手消息 → 模型流式生成 → 完成或失败。
_Avoid_: Request, Send pipeline, Handler

**Utterance**：
用户在本回合要表达的内容，闭合 ADT：纯文本或模板（可再附带单个附件）；不是 HTTP body 字段汤。
_Avoid_: Payload, Options bag, Request body

**Chat Turn Event**：
回合内有序领域事件（如 user_message、assistant_started、assistant_delta、assistant_completed、assistant_failed）；不是 SSE 字符串。
_Avoid_: SSE frame, Wire event（线路事件由适配器映射）

**Message Status**：
助手消息生命周期：generating → completed | failed。
_Avoid_: Pending, Done, Error string as status

### 模板与附件

**Prompt Template**：
用户私有的可复用提示正文，可含 `{{variable}}` 占位符与标签。
_Avoid_: Snippet, Macro, System prompt（系统提示是另一概念）

**Template Variable**：
从模板正文提取的双花括号占位名；发送前必须由服务端校验齐全并渲染。
_Avoid_: Placeholder param, Arg

**Attachment**：
单条消息最多一个文本/Markdown 文件；库中只存元数据，正文并入模型上下文。
_Avoid_: Upload blob, File entity（无独立文件浏览资源）

### 模型与后台

**Chat Model Provider**：
异步可迭代文本分片的模型抽象；echo 与 OpenAI 兼容实现都是适配器。
_Avoid_: LLM client, OpenAI SDK（具体实现名）

**Title Job**：
首条用户消息且标题仍为默认时入队的后台任务；失败不阻断聊天。
_Avoid_: Rename hook, Async title request

### 传输与运维

**SSE Wire Protocol**：
浏览器与 API 之间的服务器发送事件线路格式；由适配器把 Chat Turn Event 映射为 `message.*` 事件名。
_Avoid_: Domain event（领域事件不直接等于线路帧）

**Buffered Send**：
当前实现先聚齐回合事件再写入响应体，便于 inject 测试；真流式刷新是后续能力。
_Avoid_: Streaming flush（尚未作为默认契约）

## Architecture notes (Chat Turn)

- 外层 interface：`stream(scope, string | Utterance) → AsyncIterable<ChatTurn Event>`。
- 内核语义：单一回合编排（设计 A 的事件序与错误切分）。
- 流前失败抛领域错误；模型失败 yield `assistant_failed`，不把传输细节泄漏进 module。
- 不引入 Handle 状态机、regenerate 或 WebSocket，除非产品明确需要。
