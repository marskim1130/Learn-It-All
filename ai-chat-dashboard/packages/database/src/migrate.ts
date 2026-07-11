import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { readDatabaseConfig } from "./config.js";
const { url } = readDatabaseConfig();
const migrationClient = postgres(url, { max: 1 });
try {
  await migrate(drizzle(migrationClient), { migrationsFolder: "./drizzle" });
} finally {
  await migrationClient.end();
}
