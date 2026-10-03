import "server-only";
import { normalizeTag, normalizeTags } from "@/lib/tags";
import type { TagWithCount } from "@/lib/types";
import { db, type Tx } from "./db";
import { BadRequestError, NotFoundError } from "./errors";
import { reindexWhere } from "./search-index";
import { userId } from "./user";

/** Replaces an item's tags with `names` (normalised), creating tags as needed. */
export async function setItemTags(tx: Tx, uid: string, itemId: string, names: readonly string[]): Promise<void> {
  const wanted = normalizeTags(names);
  const current = await tx.itemTag.findMany({ where: { itemId }, include: { tag: true } });
  const removed = current.filter((c) => !wanted.includes(c.tag.name));
  if (removed.length) {
    await tx.itemTag.deleteMany({ where: { itemId, tagId: { in: removed.map((r) => r.tagId) } } });
  }
  for (const name of wanted) {
    if (current.some((c) => c.tag.name === name)) continue;
    const tag = await tx.tag.upsert({
      where: { userId_name: { userId: uid, name } },
      create: { userId: uid, name },
      update: {},
    });
    await tx.itemTag.create({ data: { itemId, tagId: tag.id } });
  }
  if (removed.length) await deleteOrphanTags(tx, removed.map((r) => r.tagId));
}

/** Tags that no longer label anything are removed, so the tag list stays tidy. */
export async function deleteOrphanTags(tx: Tx | ReturnType<typeof db>, tagIds?: string[]): Promise<void> {
  await tx.tag.deleteMany({ where: { ...(tagIds ? { id: { in: tagIds } } : {}), items: { none: {} } } });
}

export async function listTags(): Promise<TagWithCount[]> {
  const tags = await db().tag.findMany({
    where: { userId: await userId() },
    orderBy: { name: "asc" },
    include: { _count: { select: { items: { where: { item: { archivedAt: null } } } } } },
  });
  return tags.map((t) => ({ id: t.id, name: t.name, count: t._count.items }));
}

async function ownTag(id: string) {
  const tag = await db().tag.findFirst({ where: { id, userId: await userId() } });
  if (!tag) throw new NotFoundError("Tag");
  return tag;
}

/** Renames a tag; renaming onto an existing tag merges the two. */
export async function renameTag(id: string, rawName: string): Promise<void> {
  const tag = await ownTag(id);
  const name = normalizeTag(rawName);
  if (!name) throw new BadRequestError("Tag names need at least one letter or number.");
  if (name === tag.name) return;
  const itemIds = (await db().itemTag.findMany({ where: { tagId: id }, select: { itemId: true } })).map((r) => r.itemId);
  await db().$transaction(async (tx) => {
    const existing = await tx.tag.findUnique({ where: { userId_name: { userId: tag.userId, name } } });
    if (!existing) {
      await tx.tag.update({ where: { id }, data: { name } });
      return;
    }
    for (const itemId of itemIds) {
      await tx.itemTag.upsert({
        where: { itemId_tagId: { itemId, tagId: existing.id } },
        create: { itemId, tagId: existing.id },
        update: {},
      });
    }
    await tx.tag.delete({ where: { id } });
  });
  await reindexWhere({ id: { in: itemIds } });
}

/** Removes the tag from every item; the items themselves are kept. */
export async function deleteTag(id: string): Promise<void> {
  await ownTag(id);
  const itemIds = (await db().itemTag.findMany({ where: { tagId: id }, select: { itemId: true } })).map((r) => r.itemId);
  await db().tag.delete({ where: { id } });
  await reindexWhere({ id: { in: itemIds } });
}
