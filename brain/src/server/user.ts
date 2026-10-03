import "server-only";
import { db } from "./db";

let cached: string | null = null;

/**
 * The id of the local user. A local install has one user, created on first
 * use; every row is still owned by a user so multi-user sync can be added
 * without reshaping the data.
 */
export async function userId(): Promise<string> {
  if (cached) return cached;
  const existing = await db().user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  cached = existing?.id ?? (await db().user.create({ data: {}, select: { id: true } })).id;
  return cached;
}

/** For tests that swap databases. */
export function resetUserCache(): void {
  cached = null;
}
