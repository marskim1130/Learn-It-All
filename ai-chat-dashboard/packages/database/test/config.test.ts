import { describe, expect, it } from "vitest";
import { readDatabaseConfig } from "../src/config.js";
describe("readDatabaseConfig", () => {
  it("reads DATABASE_URL", () =>
    expect(
      readDatabaseConfig({ DATABASE_URL: "postgresql://user:password@localhost:5432/app" }),
    ).toEqual({ url: "postgresql://user:password@localhost:5432/app" }));
  it("rejects missing DATABASE_URL", () =>
    expect(() => readDatabaseConfig({})).toThrow("DATABASE_URL is required"));
});
