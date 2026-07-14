import { describe, expect, it } from "vitest";

import {
  createAuthSession,
  createMemorySessionStore,
  readAccessToken,
} from "../src/auth/session.js";
import { createMemoryUserRepository } from "../src/auth/users.js";

const USER_ID = "11111111-1111-1111-1111-111111111111";

describe("AuthSession", () => {
  it("创建会话后可从 Cookie 解析当前用户，撤销后失效", async () => {
    const users = createMemoryUserRepository([
      {
        id: USER_ID,
        email: "alice@example.com",
        passwordHash: "hash",
        createdAt: new Date("2026-07-13T00:00:00.000Z"),
      },
    ]);
    const store = createMemorySessionStore();
    const authSession = createAuthSession({ users, store });

    const created = await authSession.createSession(USER_ID);
    expect(created.accessToken).toEqual(expect.any(String));
    expect(created.setCookieHeader).toContain(`access_token=${created.accessToken}`);
    expect(created.setCookieHeader).toMatch(/HttpOnly/i);
    expect(created.setCookieHeader).toMatch(/SameSite=Lax/i);

    const cookie = `access_token=${created.accessToken}`;
    const user = await authSession.resolveUser(cookie);
    expect(user).toMatchObject({
      id: USER_ID,
      email: "alice@example.com",
    });

    const revoked = await authSession.revokeSession(cookie);
    expect(revoked.clearCookieHeader).toMatch(/Max-Age=0/i);

    await expect(authSession.resolveUser(cookie)).resolves.toBeNull();
    expect(readAccessToken(cookie)).toBe(created.accessToken);
  });

  it("无 Cookie 或无效令牌时 resolveUser 返回 null", async () => {
    const users = createMemoryUserRepository([
      {
        id: USER_ID,
        email: "alice@example.com",
        passwordHash: "hash",
        createdAt: new Date("2026-07-13T00:00:00.000Z"),
      },
    ]);
    const authSession = createAuthSession({
      users,
      store: createMemorySessionStore(),
    });

    await expect(authSession.resolveUser(undefined)).resolves.toBeNull();
    await expect(
      authSession.resolveUser("access_token=not-a-session"),
    ).resolves.toBeNull();
  });
});
