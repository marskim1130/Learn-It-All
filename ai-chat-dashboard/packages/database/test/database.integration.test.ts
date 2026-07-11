import { afterAll, describe, expect, it } from "vitest";
const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
let database: Awaited<ReturnType<typeof loadDatabase>> | undefined;

async function loadDatabase() {
  const { createDatabase } = await import("../src/database.js");
  return createDatabase({ url: databaseUrl!, maxConnections: 1 });
}

describeWithDatabase("PostgreSQL connection", () => {
  afterAll(async () => {
    await database?.close();
  });
  it("checkConnection resolves when PostgreSQL is available", async () => {
    database = await loadDatabase();
    await expect(database.checkConnection()).resolves.toBeUndefined();
  });
});
