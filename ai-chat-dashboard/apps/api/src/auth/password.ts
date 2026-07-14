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

/**
 * 校验明文密码与 Argon2 摘要是否匹配。
 *
 * @example
 * const ok = await verifyPassword("password123", passwordHash);
 */
export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return argon2.verify(passwordHash, password);
}
