import type { StoredUser, UserRepository } from "./users.js";

/**
 * Session Store：Access Token → User id 的可替换存储接缝。
 */
export interface SessionStore {
  set(accessToken: string, userId: string): Promise<void> | void;
  get(accessToken: string): Promise<string | null> | string | null;
  delete(accessToken: string): Promise<void> | void;
}

export interface CreatedSession {
  accessToken: string;
  setCookieHeader: string;
}

export interface RevokedSession {
  clearCookieHeader: string;
}

/**
 * Auth Session module：创建/解析/撤销登录会话。
 */
export interface AuthSession {
  createSession(userId: string): Promise<CreatedSession>;
  resolveUser(cookieHeader: string | undefined): Promise<StoredUser | null>;
  revokeSession(cookieHeader: string | undefined): Promise<RevokedSession>;
}

/**
 * 从 Cookie 头读取 access_token。
 */
export function readAccessToken(
  cookieHeader: string | undefined,
): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("access_token="))
    ?.slice("access_token=".length);
}

/**
 * 进程内 Session Store（测试与默认本地）。
 */
export function createMemorySessionStore(
  seed: Array<[string, string]> = [],
): SessionStore {
  const records = new Map(seed);

  return {
    set(accessToken, userId) {
      records.set(accessToken, userId);
    },
    get(accessToken) {
      return records.get(accessToken) ?? null;
    },
    delete(accessToken) {
      records.delete(accessToken);
    },
  };
}

function buildSessionCookie(accessToken: string): string {
  return `access_token=${accessToken}; HttpOnly; Path=/; SameSite=Lax`;
}

function buildClearSessionCookie(): string {
  return "access_token=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0";
}

/**
 * 创建 Auth Session module。
 *
 * @example
 * const authSession = createAuthSession({ users, store: createMemorySessionStore() });
 * const { accessToken, setCookieHeader } = await authSession.createSession(user.id);
 * const current = await authSession.resolveUser(`access_token=${accessToken}`);
 */
export function createAuthSession(deps: {
  users: UserRepository;
  store?: SessionStore;
  createToken?: () => string;
}): AuthSession {
  const store = deps.store ?? createMemorySessionStore();
  const createToken = deps.createToken ?? (() => crypto.randomUUID());

  return {
    async createSession(userId) {
      const accessToken = createToken();
      await store.set(accessToken, userId);
      return {
        accessToken,
        setCookieHeader: buildSessionCookie(accessToken),
      };
    },

    async resolveUser(cookieHeader) {
      const accessToken = readAccessToken(cookieHeader);
      if (!accessToken) {
        return null;
      }

      const userId = await store.get(accessToken);
      if (!userId) {
        return null;
      }

      return deps.users.findById(userId);
    },

    async revokeSession(cookieHeader) {
      const accessToken = readAccessToken(cookieHeader);
      if (accessToken) {
        await store.delete(accessToken);
      }
      return {
        clearCookieHeader: buildClearSessionCookie(),
      };
    },
  };
}
