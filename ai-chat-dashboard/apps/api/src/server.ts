import { createDatabase, readDatabaseConfig } from "@ai-chat-dashboard/database";

import { buildApp } from "./app.js";
import { createDatabaseUserRepository } from "./auth/users.js";
import { createDatabaseConversationRepository } from "./conversations/repository.js";
import { createDatabaseMessageRepository } from "./messages/repository.js";

const port = Number(process.env.API_PORT ?? 3001);
const host = process.env.API_HOST ?? "0.0.0.0";

const database = createDatabase(readDatabaseConfig());
const app = buildApp({
  database: {
    checkConnection: async () => {
      try {
        await database.checkConnection();
        return true;
      } catch {
        return false;
      }
    },
  },
  users: createDatabaseUserRepository(database),
  conversations: createDatabaseConversationRepository(database),
  messages: createDatabaseMessageRepository(database),
});

app.addHook("onClose", async () => database.close());

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
