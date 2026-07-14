# Issue 014：运行加固学习记录

## 为什么 [Why]

可演示产品还需要可运维边界：请求可追踪、日志不泄密、存活/就绪语义清晰、进程收到信号后安全停机。否则排障靠猜，密钥可能进日志，滚动发布会切断半截请求。

## 是什么 [What]

- 关联 ID [Correlation ID]：`x-request-id` 响应头；客户端可传入并回显。
- 结构化日志 [Structured Logging]：JSON 行；自动脱敏 password/token/api key。
- 存活 [Liveness]：`GET /health/live` 只表示进程在跑。
- 就绪 [Readiness]：`GET /health/ready` 检查数据库；关闭中返回 not_ready。
- 优雅关闭 [Graceful Shutdown]：`SIGINT/SIGTERM` 后拒绝新请求，关闭 HTTP/队列/数据库。
- Worker：任务日志带 correlationId，payload 脱敏，信号触发安全停止。

## 怎么做 [How]

1. `onRequest` 生成/透传 requestId，并在停机状态返回 503。
2. `onResponse` 输出脱敏后的访问日志。
3. `createShutdownController` 串行执行清理钩子。
4. API `server.ts` 与 `title-worker-main.ts` 都监听信号。

## 完整示例 [Complete Example]

```powershell
pnpm --filter @ai-chat-dashboard/api dev
# 另一终端
curl -i http://localhost:3001/health/live
curl -i -H "x-request-id: demo-1" http://localhost:3001/health/live
# Ctrl+C 后新请求应 503 shutting_down / 连接失败
```

常见错误：

- 把存活和就绪混成一个探针，导致发布时误杀健康进程。
- 日志打印完整 request body，泄露密码和密钥。
- 忽略 SIGTERM，容器强杀造成连接泄漏。
