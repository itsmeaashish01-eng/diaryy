import "server-only";
import type { FolderDTO, FolderRef } from "@/lib/types";
import { db, type Tx } from "./db";
import { BadRequestError, NotFoundError } from "./errors";
import { reindexWhere } from "./search-index";
import { userId } from "./user";

type FolderRow = { id: string; name: string; parentId: string | null };

/** id → { name, "Parent / Child" path } for every folder of the user. */
export async function folderRefs(client: Tx | ReturnType<typeof db> = db()): Promise<Map<string, FolderRef>> {
  const uid = await userId();
  const rows: FolderRow[] = await client.folder.findMany({
    where: { userId: uid },
    select: { id: true, name: true, parentId: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const refs = new Map<string, FolderRef>();
  for (const row of rows) {
    const names: string[] = [];
    const seen = new Set<string>();
    let cur: FolderRow | undefined = row;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      names.unshift(cur.name);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    refs.set(row.id, { id: row.id, name: row.name, path: names.join(" / ") });
  }
  return refs;
}

/** Items that show in lists: everything except subtasks. */
export const TOP_LEVEL = { OR: [{ task: { is: null } }, { task: { is: { parentId: null } } }] };

export async function listFolders(): Promise<FolderDTO[]> {
  const uid = await userId();
  const [rows, counts] = await Promise.all([
    db().folder.findMany({ where: { userId: uid }, orderBy: [{ position: "asc" }, { name: "asc" }] }),
    db().item.groupBy({
      by: ["folderId"],
      where: { userId: uid, archivedAt: null, folderId: { not: null }, ...TOP_LEVEL },
      _count: { _all: true },
    }),
  ]);
  const countOf = new Map(counts.map((c) => [c.folderId, c._count._all]));
  return rows.map((f) => ({
    id: f.id,
    name: f.name,
    parentId: f.parentId,
    position: f.position,
    pinned: f.pinned,
    favorite: f.favorite,
    itemCount: countOf.get(f.id) ?? 0,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  }));
}

async function descendantIds(rootId: string): Promise<string[]> {
  const uid = await userId();
  const rows = await db().folder.findMany({ where: { userId: uid }, select: { id: true, parentId: true } });
  const out: string[] = [rootId];
  for (let i = 0; i < out.length; i++) for (const r of rows) if (r.parentId === out[i]) out.push(r.id);
  return out;
}

async function ownFolder(id: string) {
  const folder = await db().folder.findFirst({ where: { id, userId: await userId() } });
  if (!folder) throw new NotFoundError("Folder");
  return folder;
}

async function nextPosition(parentId: string | null): Promise<number> {
  const last = await db().folder.findFirst({
    where: { userId: await userId(), parentId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return (last?.position ?? -1) + 1;
}

export async function createFolder(name: string, parentId: string | null = null): Promise<FolderDTO> {
  if (parentId) await ownFolder(parentId);
  const folder = await db().folder.create({
    data: { userId: await userId(), name, parentId, position: await nextPosition(parentId) },
  });
  return { ...folder, itemCount: 0, createdAt: folder.createdAt.toISOString(), updatedAt: folder.updatedAt.toISOString() };
}

export async function updateFolder(
  id: string,
  patch: { name?: string; parentId?: string | null; pinned?: boolean; favorite?: boolean },
): Promise<void> {
  const folder = await ownFolder(id);
  const data: { name?: string; parentId?: string | null; position?: number; pinned?: boolean; favorite?: boolean } = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.pinned !== undefined) data.pinned = patch.pinned;
  if (patch.favorite !== undefined) data.favorite = patch.favorite;
  if (patch.parentId !== undefined && patch.parentId !== folder.parentId) {
    if (patch.parentId) {
      await ownFolder(patch.parentId);
      if ((await descendantIds(id)).includes(patch.parentId)) {
        throw new BadRequestError("A folder cannot be moved inside itself.");
      }
    }
    data.parentId = patch.parentId;
    data.position = await nextPosition(patch.parentId);
  }
  await db().folder.update({ where: { id }, data });
  // The folder path is part of every contained item's search text.
  if (data.name !== undefined || data.parentId !== undefined) {
    await reindexWhere({ folderId: { in: await descendantIds(id) } });
  }
}

/** Swap with the previous/next sibling. */
export async function moveFolder(id: string, direction: "up" | "down"): Promise<void> {
  const folder = await ownFolder(id);
  const siblings = await db().folder.findMany({
    where: { userId: folder.userId, parentId: folder.parentId },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: { id: true },
  });
  const index = siblings.findIndex((s) => s.id === id);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swapWith < 0 || swapWith >= siblings.length) return;
  const order = siblings.map((s) => s.id);
  [order[index], order[swapWith]] = [order[swapWith]!, order[index]!];
  await db().$transaction(order.map((fid, position) => db().folder.update({ where: { id: fid }, data: { position } })));
}

/**
 * Deletes a folder without deleting anything in it: its items and subfolders
 * move up to the folder's parent (or to the top level).
 */
export async function deleteFolder(id: string): Promise<void> {
  const folder = await ownFolder(id);
  // Every item at or below this folder gets a new folder path.
  const affected = await descendantIds(id);
  const moved = await db().item.findMany({ where: { folderId: id }, select: { id: true } });
  await db().$transaction(async (tx) => {
    await tx.item.updateMany({ where: { folderId: id }, data: { folderId: folder.parentId } });
    const base = await nextPosition(folder.parentId);
    const children = await tx.folder.findMany({ where: { parentId: id }, orderBy: { position: "asc" } });
    for (const [i, child] of children.entries()) {
      await tx.folder.update({ where: { id: child.id }, data: { parentId: folder.parentId, position: base + i } });
    }
    await tx.folder.delete({ where: { id } });
  });
  const remaining = affected.filter((f) => f !== id);
  await reindexWhere({ OR: [{ folderId: { in: remaining } }, { id: { in: moved.map((m) => m.id) } }] });
}

export const STARTER_FOLDERS: Record<string, string[]> = {
  Professional: ["Career", "Job Search", "Licensing", "Immigration", "Fellowship", "Research"],
  Medicine: ["Stroke", "Neurointervention", "Guidelines", "Papers"],
  Personal: ["Finance", "Home", "Car", "Travel", "Reading"],
  Technology: ["AI", "Programming", "Mac", "Useful Tools"],
};

/** Creates the example folder tree. Only when the user has no folders yet. */
export async function createStarterFolders(): Promise<number> {
  const uid = await userId();
  if ((await db().folder.count({ where: { userId: uid } })) > 0) {
    throw new BadRequestError("Starter folders can only be added when you have no folders.");
  }
  let created = 0;
  for (const [pi, [parent, children]] of Object.entries(STARTER_FOLDERS).entries()) {
    const p = await db().folder.create({ data: { userId: uid, name: parent, position: pi } });
    created++;
    for (const [ci, name] of children.entries()) {
      await db().folder.create({ data: { userId: uid, name, parentId: p.id, position: ci } });
      created++;
    }
  }
  return created;
}
