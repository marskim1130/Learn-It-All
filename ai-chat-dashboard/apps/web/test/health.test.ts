import { expect, it, vi } from "vitest";
import { getHealth } from "../lib/health";

it("把存活成功和就绪失败转换为页面状态", async () => {
  const fetcher = vi.fn<typeof fetch>((input) =>
    Promise.resolve(
      (input instanceof Request ? input.url : input instanceof URL ? input.href : input).endsWith(
        "/live",
      )
        ? Response.json({ status: "ok" })
        : Response.json({ status: "not_ready" }, { status: 503 }),
    ),
  );
  const result = await getHealth(fetcher, "http://api.test");
  expect(result.live.available).toBe(true);
  expect(result.ready).toEqual({ available: false, detail: "HTTP 503: not_ready" });
});
