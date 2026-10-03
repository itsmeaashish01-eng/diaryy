import { defineConfig } from "prisma/config";
import { databaseUrl } from "./src/lib/database-url";

// Prisma's CLI does not read .env by itself; Node can.
try {
  process.loadEnvFile(".env");
} catch {
  // No .env — the default database location is used.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: databaseUrl() },
});
