# Issue 002：用户注册学习记录

## 为什么 [Why]

注册是后续鉴权 [Authentication]、数据隔离 [Data Isolation] 和会话归属的起点。若密码明文入库，或邮箱唯一性只靠应用层判断，后续任何登录与授权切片都会建立在不可靠基础上。

## 是什么 [What]

- `POST /auth/register` 是注册的公开 HTTP 契约 [API Contract]。
- 输入校验拒绝非法邮箱和过短密码，并返回稳定错误码 `VALIDATION_ERROR`。
- Argon2id 生成密码摘要 [Password Hash]；响应和持久化都不保存明文。
- 用户仓储 [Repository] 抽象隔离内存实现与 PostgreSQL 实现，形成测试接缝 [Testing Seam]。
- PostgreSQL 唯一约束 [Unique Constraint] 兜底邮箱冲突，映射为 `EMAIL_ALREADY_EXISTS`。

## 怎么做 [How]

1. 校验 `email` 与 `password`；失败返回 `400`。
2. 查询邮箱是否已存在；冲突返回 `409`。
3. 调用 `hashPassword()` 生成 Argon2 摘要后写入 `users` 表。
4. 成功返回 `201`，响应只包含 `id`、`email`、`createdAt`。
5. 并发冲突时捕获数据库 `23505` 唯一冲突，同样返回 `409`。

## 完整示例 [Complete Example]

```powershell
Copy-Item .env.example .env
docker compose up -d postgres
pnpm db:migrate
pnpm --filter @ai-chat-dashboard/api dev

# 成功注册
Invoke-RestMethod -Method Post -Uri http://localhost:3001/auth/register `
  -ContentType "application/json" `
  -Body '{"email":"alice@example.com","password":"password123"}'

# 重复邮箱 -> 409 EMAIL_ALREADY_EXISTS
# 无效邮箱 / 过短密码 -> 400 VALIDATION_ERROR
```

常见错误：

- 把明文密码写进日志或响应字段。
- 只在应用层检查邮箱，忽略数据库唯一约束的竞态 [Race Condition]。
- 在无 Docker 环境把集成测试硬失败，而不是按 `DATABASE_URL` 跳过。
