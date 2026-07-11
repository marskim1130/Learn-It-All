export interface DatabaseConfig {
  url: string;
  maxConnections?: number;
}
export function readDatabaseConfig(environment: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  const url = environment.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  return { url };
}
