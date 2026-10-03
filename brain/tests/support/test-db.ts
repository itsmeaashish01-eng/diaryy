// Gives each test file a fresh SQLite database with the real migrations
// applied, so integration tests exercise the same schema users get.
import Database from "better-sqlite3";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export function freshDatabase(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "brain-test-"));
  const file = path.join(dir, "test.db");
  const sqlite = new Database(file);
  const migrations = path.resolve(import.meta.dirname, "../../prisma/migrations");
  for (const name of readdirSync(migrations).filter((n) => !n.endsWith(".toml")).sort()) {
    sqlite.exec(readFileSync(path.join(migrations, name, "migration.sql"), "utf8"));
  }
  sqlite.close();
  process.env.DATABASE_URL = `file:${file}`;
  return file;
}
