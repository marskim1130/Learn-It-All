# Issue 005：管理已有聊天会话学习记录

## 为什么 [Why]

用户会整理会话：改名便于识别，删除则要干净。若重命名不立刻反映到详情/列表，界面会“撒谎”；若删除不绑定 `owner_id`，可能误删他人数据。消息表出现后，删除会话必须由数据库级联 [Cascade Delete] 清掉子消息，避免孤儿行 [Orphan Rows]。

## 是什么 [What]

- `PATCH /conversations/:id`：重命名自己的会话；空标题 `400 VALIDATION_ERROR`；他人/不存在 `404 NOT_FOUND`。
- `DELETE /conversations/:id`：删除自己的会话，成功 `204`；之后列表与详情均不可见。
- 仓储方法 `renameForOwner` / `deleteForOwner` 始终带 `ownerId` 条件。
- 重命名会刷新 `updatedAt`，列表排序自然靠前。

### 级联删除 [Cascade Delete] 设计

本切片尚无 `messages` 表（Issue 006 引入）。契约已冻结：

1. 应用层：`deleteForOwner(id, ownerId)` 只删当前用户会话。
2. 数据层：未来 `messages.conversation_id` 必须 `REFERENCES conversations(id) ON DELETE CASCADE`。
3. 这样删除会话时，数据库自动清理消息，应用无需手写“先删消息再删会话”。

## 怎么做 [How]

1. 解析 Cookie → 当前用户；未登录 `401`。
2. 重命名：校验 `title` 非空 → `renameForOwner` → 返回更新后的会话。
3. 删除：`deleteForOwner` → 无匹配则 `404`，成功则 `204`。
4. 所有写操作的 `WHERE` 同时包含 `id` 与 `owner_id`。

## 完整示例 [Complete Example]

```powershell
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Invoke-RestMethod -Method Post -Uri http://localhost:3001/auth/login `
  -ContentType "application/json" `
  -Body '{"email":"alice@example.com","password":"password123"}' `
  -WebSession $session

$created = Invoke-RestMethod -Method Post -Uri http://localhost:3001/conversations `
  -ContentType "application/json" `
  -Body '{"title":"旧标题"}' `
  -WebSession $session
$id = $created.conversation.id

# 重命名
Invoke-RestMethod -Method Patch -Uri "http://localhost:3001/conversations/$id" `
  -ContentType "application/json" `
  -Body '{"title":"新标题"}' `
  -WebSession $session

# 删除
Invoke-WebRequest -Method Delete -Uri "http://localhost:3001/conversations/$id" `
  -WebSession $session
```

常见错误：

- 只按 `id` 更新/删除，漏掉 `owner_id`。
- 删除返回 `200` 带 body，却不保证列表已空。
- 消息表外键不用 `ON DELETE CASCADE`，留下孤儿消息。
