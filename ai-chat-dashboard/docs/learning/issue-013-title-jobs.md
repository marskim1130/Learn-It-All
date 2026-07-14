# Issue 013：后台生成会话标题学习记录

## 为什么 [Why]

首条消息后自动命名会话能提升多会话可用性，但生成标题不应拖慢 SSE 主路径。用队列 [Queue] 与 Worker 解耦，失败只降级，不阻断聊天。

## 是什么 [What]

- 入队条件：会话标题仍是默认 `"新会话"`，且用户消息数 = 1
- 任务：`{ conversationId, ownerId, seedText }`
- 队列：BullMQ（Redis）；无 Redis 时 noop
- Worker：`processTitleJob` 幂等更新；标题已非默认则跳过
- 标题算法：截断 seedText（确定性，测试稳定）

## 怎么做 [How]

1. 用户消息持久化后检查 `shouldEnqueueTitleJob`
2. `titleQueue.enqueue`；异常吞掉
3. Worker 消费后 `renameForOwner`
4. jobId = `title:{conversationId}` 防重复入队；attempts=3

## 完整示例 [Complete Example]

```powershell
docker compose up -d redis
# 终端 1
pnpm --filter @ai-chat-dashboard/api dev
# 终端 2
pnpm --filter @ai-chat-dashboard/api worker

# 创建默认标题会话并发送首条消息后，Worker 日志出现 title_job_completed
```

常见错误：

- 在请求线程同步调模型生成标题，拖垮 TTFB。
- 重试时覆盖用户已手改标题。
- 队列失败导致消息接口 500。
