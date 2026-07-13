import argon2 from "argon2";

/**
 * 使用 Argon2id 生成密码摘要 [Password Hash]。
 *
 * @example
 * const passwordHash = await hashPassword("password123");
 * // passwordHash 以 "$argon2" 开头，不包含明文密码。
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}
