import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { DatabaseConfig } from "./config.js";
import { schema } from "./schema.js";

export interface Database {
  readonly client: PostgresJsDatabase<typeof schema>;
  checkConnection(): Promise<void>;
  close(): Promise<void>;
}

export function createDatabase(config: DatabaseConfig): Database {
  const sql = postgres(config.url, { max: config.maxConnections ?? 10 });
  return {
    client: drizzle(sql, { schema }),
    async checkConnection() {
      await sql`select 1`;
    },
    async close() {
      await sql.end();
    },
  };
}
