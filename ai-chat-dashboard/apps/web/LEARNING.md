# 教学说明

- 页面是服务器组件 [Server Component]，API 地址不会暴露为浏览器公共变量。
- `cache: "no-store"` 与 `dynamic = "force-dynamic"` 保证每次请求重新检查状态。
- 存活检查 [Liveness Check] 表示进程可响应；就绪检查 [Readiness Check] 表示依赖可用、可承接流量。
- `getHealth` 注入 `fetcher`，形成测试接缝 [Testing Seam]，纯函数测试无需启动服务。
