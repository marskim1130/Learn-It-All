# Issue 007：OpenAI 兼容模型学习记录

## 为什么 [Why]

业务代码不应绑定某个厂商 SDK。用薄适配层 [Provider Adapter] 统一 `ChatModelProvider.stream()`，既能在 CI 用假提供商 [Fake Provider]，也能在本地切到 OpenAI / Ollama 等兼容接口做真实演示。密钥必须只存在服务端环境变量，绝不能进浏览器或日志。

## 是什么 [What]

- `createOpenAICompatibleProvider`：HTTP 调用 `POST {baseUrl}/chat/completions`，`stream: true`。
- 解析上游 SSE：`data: {"choices":[{"delta":{"content":"..."}}]}` → 统一 `{ delta }`。
- `resolveChatModelProvider`：
  - 默认 `CHAT_PROVIDER=echo`
  - `CHAT_PROVIDER=openai` 时读取 `OPENAI_BASE_URL` / `OPENAI_API_KEY` / `OPENAI_MODEL`
- CI 与默认本地路径不访问真实网络。

## 怎么做 [How]

1. 请求头：`Authorization: Bearer <key>`、`Content-Type: application/json`。
2. 请求体：`{ model, stream: true, messages }`。
3. 读取 `response.body` 流，按行解析 `data:`；遇到 `[DONE]` 结束。
4. 非 2xx 抛错，由消息路由转为 `message.assistant.failed`。
5. 测试用 `fetch` 替身喂固定 SSE，不打真实 API。

## 完整示例 [Complete Example]

```powershell
# .env
CHAT_PROVIDER=openai
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# 或 Ollama
# OPENAI_BASE_URL=http://127.0.0.1:11434/v1
# OPENAI_API_KEY=ollama
# OPENAI_MODEL=llama3.2

pnpm --filter @ai-chat-dashboard/api dev
```

常见错误：

- 把 `OPENAI_API_KEY` 写成 `NEXT_PUBLIC_*`，泄露到浏览器。
- 默认就连真实模型，导致 CI 不稳定与费用。
- 只解析完整 JSON 响应，忽略 SSE 分片协议。
