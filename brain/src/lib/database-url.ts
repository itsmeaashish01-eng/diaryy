import { mkdirSync } from "node:fs";
import path from "node:path";

const DEFAULT_URL = "file:./data/brain.db";

/**
 * The SQLite URL with its path made absolute, so the CLI, the app and the
 * scripts all open the same file no matter which directory they start in.
 * Creates the parent directory if needed.
 */
export function databaseUrl(raw: string | undefined = process.env.DATABASE_URL): string {
  const url = raw && raw.trim() ? raw.trim() : DEFAULT_URL;
  if (!url.startsWith("file:")) return url; // PostgreSQL etc. — used as is.
  const file = url.slice("file:".length);
  const absolute = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
  mkdirSync(path.dirname(absolute), { recursive: true });
  return `file:${absolute}`;
}
