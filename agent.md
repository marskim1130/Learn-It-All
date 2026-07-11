# AGENT.md

模拟真实开发场景中，开发者是如何一步步实现项目的，每次完成一个小功能，逐步推荐，按真实开发过程最佳实践的顺序。

## Goal

本项目定位为教学型开源项目。

任何新增功能，都必须做到：

- 可维护
- 可阅读
- 可学习
- 可运行
- 可演示

---

## Code

所有代码必须：

- 使用 TypeScript
- 必要位置添加注释
- 公开 API 必须写 JSDoc
- 不允许复杂代码没有解释
- 保持函数职责单一

---

## Examples

每个公开 API 必须提供 Example。

Example 必须能够直接运行。

Example 可以放在：

- README
- docs
- examples

---

## HTML Demo

每个功能必须配套一个 HTML Demo。

HTML 页面必须包含：

- 功能介绍
- API
- 设计思想
- 核心语法解释
- 可运行 Demo
- 常见错误
- Example

Demo 必须可以直接打开运行。

---

## Documentation

新增功能后必须同步更新：

- README
- API 文档
- Example
- HTML Demo

---

## Tests

所有核心功能必须提供测试。

至少覆盖：

- 正常情况
- Edge Case
- 错误输入
- Example

---

## Project Structure

推荐：

src/
examples/
docs/
tests/

保持结构清晰。

---

## Before Finish

提交前必须确认：

- 功能完成
- Example 完成
- HTML Demo 完成
- README 更新
- Test 通过

所有教程必须以"为什么（Why）→ 是什么（What）→ 怎么做（How）→ 完整 Example"的顺序编写，而不是直接给代码。
