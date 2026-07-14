export type EndpointStatus = { available: boolean; detail: string };

type Fetcher = typeof fetch;

async function check(fetcher: Fetcher, url: string, expected: string): Promise<EndpointStatus> {
  try {
    const response = await fetcher(url, { cache: "no-store" });
    const body = (await response.json()) as { status?: string };
    return response.ok && body.status === expected
      ? { available: true, detail: "正常" }
      : { available: false, detail: `HTTP ${response.status}: ${body.status ?? "unknown"}` };
  } catch (error) {
    return { available: false, detail: error instanceof Error ? error.message : "未知错误" };
  }
}

export async function getHealth(
  fetcher: Fetcher = fetch,
  baseUrl = process.env.API_BASE_URL ?? "http://localhost:3001",
) {
  const [live, ready] = await Promise.all([
    check(fetcher, `${baseUrl}/health/live`, "ok"),
    check(fetcher, `${baseUrl}/health/ready`, "ready"),
  ]);
  return { baseUrl, live, ready };
}
