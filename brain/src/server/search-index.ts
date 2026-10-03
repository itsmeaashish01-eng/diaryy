import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { FolderRef } from "@/lib/types";
import { db, type Tx } from "./db";
import { folderRefs } from "./folders";

export const INDEX_INCLUDE = {
  tags: { include: { tag: { select: { name: true } } } },
  task: { select: { description: true, url: true, status: true, priority: true } },
  note: { select: { contentText: true } },
  bookmark: { select: { url: true, domain: true, description: true, notes: true, siteTitle: true } },
} satisfies Prisma.ItemInclude;

type IndexRow = Prisma.ItemGetPayload<{ include: typeof INDEX_INCLUDE }>;

/** Everything a search should find an item by, lower-cased, in one string. */
export function buildSearchText(item: IndexRow, folder: FolderRef | undefined): string {
  const parts: (string | null | undefined)[] = [
    item.title,
    item.type.toLowerCase(),
    item.task?.description,
    item.task?.url,
    item.note?.contentText,
    item.bookmark?.url,
    item.bookmark?.domain,
    item.bookmark?.siteTitle,
    item.bookmark?.description,
    item.bookmark?.notes,
    folder?.path,
    ...item.tags.map((t) => `#${t.tag.name} ${t.tag.name}`),
  ];
  return parts
    .filter(Boolean)
    .join("\n")
    .toLowerCase()
    .slice(0, 400_000);
}

/** Rebuilds the search text of every item matching `where`. */
export async function reindexWhere(where: Prisma.ItemWhereInput, client: Tx | ReturnType<typeof db> = db()) {
  const [items, folders] = await Promise.all([
    client.item.findMany({ where, include: INDEX_INCLUDE }),
    folderRefs(client),
  ]);
  for (const item of items) {
    const searchText = buildSearchText(item, item.folderId ? folders.get(item.folderId) : undefined);
    if (searchText !== item.searchText) {
      await client.item.update({ where: { id: item.id }, data: { searchText } });
    }
  }
}
