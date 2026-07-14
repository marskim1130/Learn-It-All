# Issue 004：创建并查看聊天会话学习记录

## 为什么 [Why]

聊天产品的核心对象是“会话 [Conversation]”。若创建后无法按用户隔离列表与详情，后续消息、流式回复和 Prompt 都会建立在错误的数据边界上。授权 [Authorization] 必须在服务端用 `owner_id` 约束，不能依赖前端隐藏。

## 是什么 [What]

- `POST /conversations`：登录用户创建会话，标题可选，默认 `"新会话"`。
- `GET /conversations`：只返回当前用户的会话列表，按 `updatedAt` 降序。
- `GET /conversations/:id`：读取自己的会话；他人资源与不存在统一 `404 NOT_FOUND`。
- 会话仓储 [Repository] 提供内存与 PostgreSQL 两套实现，测试通过注入替换。
- 数据库表 `conversations`：`id`、`owner_id`、`title`、时间戳。

跨用户访问返回 `404` 而不是 `403`：避免向调用方泄露“资源存在但无权限”。

## 怎么做 [How]

1. 从 Cookie 解析当前用户；未登录返回 `401 UNAUTHORIZED`。
2. 创建时写入 `owner_id = 当前用户 id`。
3. 列表调用 `listByOwner(userId)`，仓储层过滤 owner。
4. 详情调用 `findByIdForOwner(id, userId)`；查不到即 `NOT_FOUND`。
5. 响应只暴露公开字段：`id`、`title`、`createdAt`、`updatedAt`。

## 完整示例 [Complete Example]

```powershell
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Invoke-RestMethod -Method Post -Uri http://localhost:3001/auth/login `
  -ContentType "application/json" `
  -Body '{"email":"alice@example.com","password":"password123"}' `
  -WebSession $session

# 创建
$created = Invoke-RestMethod -Method Post -Uri http://localhost:3001/conversations `
  -ContentType "application/json" `
  -Body '{"title":"学习计划"}' `
  -WebSession $session

# 列表
Invoke-RestMethod -Uri http://localhost:3001/conversations -WebSession $session

# 详情
Invoke-RestMethod -Uri "http://localhost:3001/conversations/$($created.conversation.id)" `
  -WebSession $session
```

常见错误：

- 只按 `id` 查询，忘记同时约束 `owner_id`。
- 跨用户返回 `403`，泄露资源是否存在。
- 把 `ownerId` 暴露给前端作为“前端过滤条件”，而不是服务端硬约束。
