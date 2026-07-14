# Issue 010：带变量的 Prompt 模板学习记录

## 为什么 [Why]

模板若不能填变量，就只能静态复用。变量提取、校验与渲染必须在服务端完成，避免前端绕过必填校验；最终消息要保存渲染文本与模板来源，便于追溯。

## 是什么 [What]

- `extractTemplateVariables(body)`：提取 `{{name}}`，去重保序。
- `renderTemplate(body, variables)`：替换占位符。
- `GET /prompt-templates/:id/variables` → `{ variables: string[] }`。
- `POST /conversations/:id/messages` 支持：
  - `promptTemplateId`
  - `variables: Record<string, string>`
- 用户消息保存渲染结果与 `promptTemplateId`。
- 缺失变量 → `400 VALIDATION_ERROR`（`variables.<name>`）。

## 怎么做 [How]

1. 校验模板归属当前用户。
2. 提取 required 变量；任一为空/缺失则拒绝。
3. 渲染最终 content，写入消息 `prompt_template_id`。
4. 继续既有 SSE 流。

## 完整示例 [Complete Example]

```powershell
# 模板 body: 你好 {{name}}，今天聊 {{topic}}
Invoke-RestMethod -Uri "http://localhost:3001/prompt-templates/<id>/variables" -WebSession $session

Invoke-WebRequest -Method Post `
  -Uri "http://localhost:3001/conversations/<cid>/messages" `
  -ContentType "application/json" `
  -Body '{"promptTemplateId":"<id>","variables":{"name":"Alice","topic":"TDD"}}' `
  -WebSession $session
```

常见错误：

- 只在前端校验变量，服务端不校验。
- 消息只存模板 ID 不存渲染文本，历史无法离线展示。
