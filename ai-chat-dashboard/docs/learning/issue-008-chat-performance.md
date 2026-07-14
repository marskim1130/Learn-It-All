# Issue 008：聊天交互与长会话性能学习记录

## 为什么 [Why]

流式聊天有三类高频成本：

1. **SSE 分片过密**：每个 delta 都 `setState` 会打爆渲染。
2. **长消息列表**：DOM 节点随历史线性增长，滚动卡顿。
3. **会话切换**：同步替换大量状态时，输入框会“卡住”。

PRD 要求先记录优化前基线，再做虚拟化 [Virtualization] 与批量刷新。

## 优化前基线 [Baseline]（假设与测量点）

| 场景 | 未优化行为 | 观察点 |
|------|------------|--------|
| 流式回复 | 每字一次 React 更新 | React Profiler commit 次数 |
| 500 条历史 | 渲染全部消息节点 | DOM 节点数 / 滚动 FPS |
| 切换会话 | 同步卸载+挂载整页列表 | 输入延迟、`isPending` |

本切片用可重复的纯函数/控制器测试锁定行为；页面提供实验台手动观察。

## 是什么 [What]

- `createStreamTextBatcher`：时间窗合并 delta，只 flush 完整文本。
- `getVirtualWindow`：固定行高窗口计算（教学对照）。
- `MessageList`：`@tanstack/react-virtual` 只渲染可视区。
- `createSessionSwitchController` + `useTransition`：切换 pending 时草稿仍可编辑。
- `/chat` 性能实验台页面。

## 怎么做 [How]

1. 流式：`append` 累计文本，timer/rAF 窗口到期再 `onFlush`。
2. 列表：`useVirtualizer({ count, estimateSize, overscan })`，绝对定位可视行。
3. 切换：`startTransition` 包住会话状态更新，输入受控组件继续接收 `onChange`。

## 完整示例 [Complete Example]

```powershell
pnpm --filter @ai-chat-dashboard/web dev
# 打开 http://localhost:3000/chat
# 切换 C1/C2，同时在输入框打字；点击“模拟流式分片”观察 flush 次数 < 分片数
```

常见错误：

- 虚拟列表忘设容器固定高度与 `overflow: auto`。
- 批量器只缓存 delta 不累计全文，导致 UI 丢字。
- 把输入也放进 transition，反而降低输入优先级。
