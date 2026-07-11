import { getHealth } from "../lib/health";

export const dynamic = "force-dynamic";

export default async function Page() {
  const health = await getHealth();
  return (
    <main>
      <h1>AI Chat Dashboard</h1>
      <p>服务器组件 [Server Component] 实时检查 API。</p>
      <ul>
        <li>存活 [Liveness]：{health.live.available ? "正常" : `异常：${health.live.detail}`}</li>
        <li>
          就绪 [Readiness]：{health.ready.available ? "正常" : `异常：${health.ready.detail}`}
        </li>
      </ul>
      <small>API：{health.baseUrl}</small>
    </main>
  );
}
