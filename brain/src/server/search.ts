import "server-only";
import { scoreMatch, tokenize } from "@/lib/search";
import { TYPE_LABEL, type ItemType, type SearchHit } from "@/lib/types";
import { db } from "./db";
import { folderRefs } from "./folders";
import { userId } from "./user";

export interface SearchOptions {
  type?: ItemType | "FOLDER" | "TAG";
  limit?: number;
  includeArchived?: boolean;
}

/**
 * Finds items, folders and tags matching every word of `query`. Items match on
 * title, body, URL, tags and folder path; results are ranked by where the
 * words matched (title beats body) with a nudge for pinned and recent items.
 */
export async function search(query: string, opts: SearchOptions = {}): Promise<SearchHit[]> {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const uid = await userId();
  const limit = opts.limit ?? 50;
  const hits: SearchHit[] = [];
  const folders = await folderRefs();

  if (!opts.type || (opts.type !== "FOLDER" && opts.type !== "TAG")) {
    const rows = await db().item.findMany({
      where: {
        userId: uid,
        ...(opts.includeArchived ? {} : { archivedAt: null }),
        ...(opts.type ? { type: opts.type } : {}),
        AND: tokens.map((t) => ({ searchText: { contains: t } })),
      },
      select: {
        id: true,
        type: true,
        title: true,
        searchText: true,
        pinned: true,
        favorite: true,
        updatedAt: true,
        folderId: true,
        archivedAt: true,
        tags: { select: { tag: { select: { name: true } } } },
        task: { select: { status: true, dueDate: true } },
        bookmark: { select: { domain: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 1000,
    });
    for (const r of rows) {
      const tags = r.tags.map((t) => t.tag.name);
      const score = scoreMatch(tokens, { ...r, tags });
      if (score <= 0) continue;
      const type = r.type as ItemType;
      const where = r.folderId ? folders.get(r.folderId)?.path : undefined;
      const detail = r.bookmark?.domain ?? (r.task?.dueDate ? `due ${r.task.dueDate}` : undefined);
      hits.push({
        kind: type,
        id: r.id,
        title: r.title,
        subtitle: [TYPE_LABEL[type], detail, where, r.archivedAt ? "archived" : undefined].filter(Boolean).join(" · "),
        href: `/items/${r.id}`,
        score,
        done: r.task?.status === "DONE",
      });
    }
  }

  if (!opts.type || opts.type === "FOLDER") {
    for (const f of folders.values()) {
      const path = f.path.toLowerCase();
      if (!tokens.every((t) => path.includes(t))) continue;
      const score = scoreMatch(tokens, { title: f.name, searchText: path, tags: [] });
      hits.push({ kind: "FOLDER", id: f.id, title: f.name, subtitle: `Folder · ${f.path}`, href: `/folders/${f.id}`, score: score + 4 });
    }
  }

  if (!opts.type || opts.type === "TAG") {
    const tags = await db().tag.findMany({
      where: { userId: uid, AND: tokens.map((t) => ({ name: { contains: t } })) },
      include: { _count: { select: { items: true } } },
      take: 20,
    });
    for (const t of tags) {
      hits.push({
        kind: "TAG",
        id: t.id,
        title: `#${t.name}`,
        subtitle: `Tag · ${t._count.items} item${t._count.items === 1 ? "" : "s"}`,
        href: `/tags/${encodeURIComponent(t.name)}`,
        score: scoreMatch(tokens, { title: t.name, searchText: t.name, tags: [t.name] }) + 4,
      });
    }
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
