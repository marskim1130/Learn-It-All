# Issue 006：发送消息与模拟流式回复学习记录

## 为什么 [Why]

聊天的核心体验是“边生成边显示”。若等模型完整返回再渲染，首字延迟 [Time To First Token] 会很长。服务器发送事件 [Server-Sent Events, SSE] 适合单向推送分片；同时必须在流开始前持久化用户消息，避免刷新后丢输入。助手消息需要 `generating / completed / failed` 状态，才能表达进行中、成功与失败。

## 是什么 [What]

- `POST /conversations/:id/messages`：发送用户消息，响应 `text/event-stream`。
- `GET /conversations/:id/messages`：读取会话消息历史（按时间升序）。
- SSE 事件：
  - `message.user`
  - `message.assistant.started`
  - `message.assistant.delta`
  - `message.assistant.completed`
  - `message.assistant.failed`
- `ChatModelProvider` 抽象 + 回显假提供商 [Fake Provider]，CI 不调用真实模型。
- `messages` 表对 `conversation_id` 使用 `ON DELETE CASCADE`。

## 怎么做 [How]

1. 校验登录、会话归属、`content` 非空。
2. 先写入 `user` 消息（`completed`）。
3. 创建 `assistant` 消息（`generating`，内容空）。
4. 调用 `chatModel.stream()`，每片追加 `delta` 事件。
5. 成功则更新助手为 `completed`；异常/中断则 `failed`。
6. 历史读取只在 `owner` 会话下执行。

## 完整示例 [Complete Example]

```powershell
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Invoke-RestMethod -Method Post -Uri http://localhost:3001/auth/login `
  -ContentType "application/json" `
  -Body '{"email":"alice@example.com","password":"password123"}' `
  -WebSession $session

# 假设已有 conversationId
Invoke-WebRequest -Method Post `
  -Uri "http://localhost:3001/conversations/<id>/messages" `
  -ContentType "application/json" `
  -Body '{"content":"你好"}' `
  -WebSession $session

Invoke-RestMethod -Uri "http://localhost:3001/conversations/<id>/messages" `
  -WebSession $session
```

常见错误：

- 流结束后才写用户消息，刷新会丢输入。
- 助手失败后仍停在 `generating`，UI 永久转圈。
- 消息表外键不用 `ON DELETE CASCADE`，删除会话留下孤儿消息。
