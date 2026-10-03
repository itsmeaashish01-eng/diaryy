// Makes a consistent copy of the database into ./backups, safe to run while
// the app is running (SQLite's online backup API). Keeps the 30 newest.
//
//   npm run backup
//
// Restore by stopping the app and copying a backup over data/brain.db — or
// use Settings → Restore with a JSON export.
import Database from "better-sqlite3";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

try {
  process.loadEnvFile(".env");
} catch {
  // no .env: use the default location
}

const url = process.env.DATABASE_URL || "file:./data/brain.db";
if (!url.startsWith("file:")) {
  console.error("npm run backup only handles SQLite. For PostgreSQL use pg_dump.");
  process.exit(1);
}
const source = path.resolve(url.slice("file:".length));
if (!existsSync(source)) {
  console.error(`No database at ${source}. Run "npm run db:migrate" first.`);
  process.exit(1);
}

const dir = path.resolve("backups");
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const target = path.join(dir, `brain-${stamp}.db`);

const db = new Database(source, { readonly: true });
await db.backup(target);
db.close();
console.log(`Backed up to ${target}`);

const old = readdirSync(dir).filter((f) => /^brain-.*\.db$/.test(f)).sort().reverse().slice(30);
for (const f of old) rmSync(path.join(dir, f));
