# Issue 009：基础 Prompt 模板学习记录

## 为什么 [Why]

可复用 Prompt 是聊天产品的高频能力。模板必须私有（按用户隔离），并支持名称、描述、正文、标签与筛选。变量渲染留给 Issue 010；本切片先把 CRUD 与数据边界做稳。

## 是什么 [What]

- `POST /prompt-templates`：创建
- `GET /prompt-templates?q=`：列表 + 子串筛选
- `GET /prompt-templates/:id`：详情
- `PATCH /prompt-templates/:id`：更新
- `DELETE /prompt-templates/:id`：删除（204）
- 表 `prompt_templates`：`owner_id`、`name`、`description`、`body`、`tags(jsonb)`

## 怎么做 [How]

1. 所有读写绑定 `owner_id`；跨用户统一 `404 NOT_FOUND`。
2. `name` / `body` 必填；`description` 默认空串；`tags` 字符串数组。
3. 筛选 `q` 对 name/description/body/tags 做不区分大小写包含匹配。
4. 内存仓储供测试，PostgreSQL 仓储供生产。

## 完整示例 [Complete Example]

```powershell
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Invoke-RestMethod -Method Post -Uri http://localhost:3001/auth/login `
  -ContentType "application/json" `
  -Body '{"email":"alice@example.com","password":"password123"}' `
  -WebSession $session

Invoke-RestMethod -Method Post -Uri http://localhost:3001/prompt-templates `
  -ContentType "application/json" `
  -Body '{"name":"代码审查","description":"审查 PR","body":"请审查代码","tags":["code"]}' `
  -WebSession $session

Invoke-RestMethod -Uri "http://localhost:3001/prompt-templates?q=代码" -WebSession $session
```

常见错误：

- 只按 id 更新/删除，漏 `owner_id`。
- tags 存成逗号字符串，后续筛选与变量渲染难扩展。
