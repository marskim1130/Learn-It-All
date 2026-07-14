# Issue 003：登录与身份会话学习记录

## 为什么 [Why]

仅有注册不足以建立可复用身份。登录要证明“你是谁”，Cookie 会话 [Session] 要让后续请求自动携带身份，退出要保证旧令牌立即失效。若错误凭据泄露“邮箱是否存在”，攻击者可以枚举账户。

## 是什么 [What]

- `POST /auth/login`：校验邮箱密码，签发访问令牌 [Access Token] 写入 `HttpOnly` Cookie。
- `GET /auth/me`：根据 Cookie 恢复当前用户公开信息。
- `POST /auth/logout`：清除 Cookie，并在服务端作废令牌。
- 错误凭据统一返回 `401 INVALID_CREDENTIALS`，不区分邮箱不存在与密码错误。
- 未认证访问返回 `401 UNAUTHORIZED`。

本切片使用**不透明会话令牌 [Opaque Session Token]**（随机 UUID）+ 进程内会话表，而不是把用户 ID 直接当 Cookie 值，也暂未上 JWT：

| 方案 | 优点 | 缺点 |
|------|------|------|
| 用户 ID 当 Cookie | 实现极简 | 无法单独作废；可被猜测/伪造 |
| JWT 无状态 | 易水平扩展 | 退出需黑名单或极短过期 |
| 不透明令牌 + 会话表 | 退出可立即失效，测试直观 | 多实例需共享存储 |

教学第一版优先“可演示的退出失效”，因此选择会话表。后续若引入 JWT，可在会话或黑名单层保留作废能力。

## 怎么做 [How]

1. 登录：`findByEmail` → `verifyPassword`（Argon2）→ 生成 `access_token` → 写入 `sessions` Map → `Set-Cookie`。
2. 查询身份：解析 Cookie → 查会话表得到 `userId` → `findById` → 返回公开用户字段。
3. 退出：删除会话表条目，并下发 `Max-Age=0` 的清空 Cookie。
4. Cookie 属性：`HttpOnly; Path=/; SameSite=Lax`（开发环境不强制 `Secure`，避免本地 HTTP 丢 Cookie）。

## 完整示例 [Complete Example]

```powershell
# 先注册
Invoke-RestMethod -Method Post -Uri http://localhost:3001/auth/register `
  -ContentType "application/json" `
  -Body '{"email":"alice@example.com","password":"password123"}'

# 登录（保存 Cookie）
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Invoke-RestMethod -Method Post -Uri http://localhost:3001/auth/login `
  -ContentType "application/json" `
  -Body '{"email":"alice@example.com","password":"password123"}' `
  -WebSession $session

# 当前身份
Invoke-RestMethod -Uri http://localhost:3001/auth/me -WebSession $session

# 退出
Invoke-WebRequest -Method Post -Uri http://localhost:3001/auth/logout -WebSession $session

# 再次查询应 401
```

常见错误：

- 错误密码与不存在邮箱返回不同错误码，导致账户枚举。
- 只清除浏览器 Cookie，服务端仍接受旧令牌。
- 把访问令牌放进 JSON 响应体，扩大 XSS 窃取面。
