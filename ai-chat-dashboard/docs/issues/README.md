# 实施 Issue 索引

所有任务均为端到端垂直切片 [Vertical Slice]，禁止水平分层 [Horizontal Slicing]。

| 编号          | 标题                       | 类型 | 阻塞项                                                |
| ------------- | -------------------------- | ---- | ----------------------------------------------------- |
| [001](001.md) | 建立可运行的工程骨架       | AFK  | None - can start immediately                          |
| [002](002.md) | 完成用户注册               | AFK  | Issue 001                                             |
| [003](003.md) | 完成登录与身份会话         | AFK  | Issue 002                                             |
| [004](004.md) | 创建并查看聊天会话         | AFK  | Issue 003                                             |
| [005](005.md) | 管理已有聊天会话           | AFK  | Issue 004                                             |
| [006](006.md) | 发送消息并接收模拟流式回复 | AFK  | Issue 004                                             |
| [007](007.md) | 连接 OpenAI 兼容模型       | HITL | Issue 006                                             |
| [008](008.md) | 改善聊天交互与长会话性能   | AFK  | Issue 006                                             |
| [009](009.md) | 管理基础 Prompt 模板       | AFK  | Issue 003                                             |
| [010](010.md) | 使用带变量的 Prompt 模板   | AFK  | Issue 006、Issue 009                                  |
| [011](011.md) | 给消息添加文本附件         | AFK  | Issue 006                                             |
| [012](012.md) | 限制登录请求频率           | AFK  | Issue 003                                             |
| [013](013.md) | 后台生成会话标题           | AFK  | Issue 007、Issue 012                                  |
| [014](014.md) | 加固运行与故障处理         | AFK  | Issue 006、Issue 013                                  |
| [015](015.md) | 验证完整用户旅程           | AFK  | Issue 007、Issue 010、Issue 011、Issue 013、Issue 014 |
