import "server-only";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";
import { databaseUrl } from "@/lib/database-url";

export type Db = InstanceType<typeof PrismaClient>;

function createClient(): Db {
  const url = databaseUrl();
  const file = url.startsWith("file:") ? url.slice("file:".length) : url;
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: file }) });
}

// One client per process; survive hot reloads in development.
const globalForDb = globalThis as unknown as { __brainDb?: Db };

export function db(): Db {
  globalForDb.__brainDb ??= createClient();
  return globalForDb.__brainDb;
}

/** Transaction client type, for helpers that run inside `$transaction`. */
export type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];
