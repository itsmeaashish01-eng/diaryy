import "server-only";
import { z } from "zod";
import { toCsv } from "@/lib/csv";
import { docToMarkdown, docToText, parseDoc, sanitizeDoc } from "@/lib/rich-text";
import { normalizeTags } from "@/lib/tags";
import { ITEM_TYPES, PRIORITIES, RECURRENCES, TASK_STATUSES } from "@/lib/types";
import { normalizeUrl } from "@/lib/url";
import { createZip, safeFileName, type ZipEntry } from "@/lib/zip";
import { db } from "./db";
import { BadRequestError } from "./errors";
import { folderRefs } from "./folders";
import { reindexWhere } from "./search-index";
import { setItemTags } from "./tags";
import { userId } from "./user";

export const EXPORT_FORMAT = "brain-export";
export const EXPORT_VERSION = 1;

// ---- The JSON format ------------------------------------------------------
// Plain, documented JSON: everything needed to rebuild the database, nothing
// tied to this app's internals. See README "Export format".

const iso = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date");
const id = z.string().min(1).max(64);

const exportSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(EXPORT_VERSION),
  exportedAt: iso,
  folders: z.array(
    z.object({
      id,
      name: z.string().min(1).max(120),
      parentId: id.nullable(),
      position: z.number().int(),
      pinned: z.boolean(),
      favorite: z.boolean(),
      createdAt: iso,
      updatedAt: iso,
    }),
  ),
  items: z.array(
    z.object({
      id,
      type: z.enum(ITEM_TYPES),
      title: z.string().max(500),
      folderId: id.nullable(),
      pinned: z.boolean(),
      favorite: z.boolean(),
      inbox: z.boolean(),
      tags: z.array(z.string()),
      createdAt: iso,
      updatedAt: iso,
      archivedAt: iso.nullable(),
      task: z
        .object({
          description: z.string(),
          status: z.enum(TASK_STATUSES),
          priority: z.enum(PRIORITIES),
          dueDate: z.string().nullable(),
          dueTime: z.string().nullable(),
          url: z.string().nullable(),
          recurrence: z.enum(RECURRENCES),
          parentId: id.nullable(),
          position: z.number().int(),
          completedAt: iso.nullable(),
          lastCompletedAt: iso.nullable(),
        })
        .nullable(),
      note: z.object({ content: z.string(), contentText: z.string() }).nullable(),
      bookmark: z
        .object({
          url: z.string(),
          domain: z.string(),
          faviconUrl: z.string().nullable(),
          siteTitle: z.string().nullable(),
          description: z.string(),
          notes: z.string(),
          credentialUrl: z.string().nullable(),
        })
        .nullable(),
      reminders: z.array(z.object({ id, remindAt: iso, firedAt: iso.nullable() })),
    }),
  ),
  relations: z.array(
    z.object({ id, sourceId: id, targetId: id, origin: z.enum(["MANUAL", "WIKILINK"]), createdAt: iso }),
  ),
});

export type ExportData = z.infer<typeof exportSchema>;

async function loadAll() {
  const uid = await userId();
  const [folders, items, relations, refs] = await Promise.all([
    db().folder.findMany({ where: { userId: uid }, orderBy: [{ parentId: "asc" }, { position: "asc" }] }),
    db().item.findMany({
      where: { userId: uid },
      orderBy: { createdAt: "asc" },
      include: {
        task: true,
        note: true,
        bookmark: true,
        tags: { include: { tag: true } },
        reminders: true,
      },
    }),
    db().itemRelation.findMany({ where: { source: { userId: uid } }, orderBy: { createdAt: "asc" } }),
    folderRefs(),
  ]);
  return { folders, items, relations, refs };
}

export async function exportJson(): Promise<ExportData> {
  const { folders, items, relations } = await loadAll();
  const d = (v: Date) => v.toISOString();
  const dn = (v: Date | null) => (v ? v.toISOString() : null);
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    folders: folders.map((f) => ({
      id: f.id,
      name: f.name,
      parentId: f.parentId,
      position: f.position,
      pinned: f.pinned,
      favorite: f.favorite,
      createdAt: d(f.createdAt),
      updatedAt: d(f.updatedAt),
    })),
    items: items.map((i) => ({
      id: i.id,
      type: i.type as ExportData["items"][number]["type"],
      title: i.title,
      folderId: i.folderId,
      pinned: i.pinned,
      favorite: i.favorite,
      inbox: i.inbox,
      tags: i.tags.map((t) => t.tag.name).sort(),
      createdAt: d(i.createdAt),
      updatedAt: d(i.updatedAt),
      archivedAt: dn(i.archivedAt),
      task: i.task
        ? {
            description: i.task.description,
            status: i.task.status as (typeof TASK_STATUSES)[number],
            priority: i.task.priority as (typeof PRIORITIES)[number],
            dueDate: i.task.dueDate,
            dueTime: i.task.dueTime,
            url: i.task.url,
            recurrence: i.task.recurrence as (typeof RECURRENCES)[number],
            parentId: i.task.parentId,
            position: i.task.position,
            completedAt: dn(i.task.completedAt),
            lastCompletedAt: dn(i.task.lastCompletedAt),
          }
        : null,
      note: i.note ? { content: i.note.content, contentText: i.note.contentText } : null,
      bookmark: i.bookmark
        ? {
            url: i.bookmark.url,
            domain: i.bookmark.domain,
            faviconUrl: i.bookmark.faviconUrl,
            siteTitle: i.bookmark.siteTitle,
            description: i.bookmark.description,
            notes: i.bookmark.notes,
            credentialUrl: i.bookmark.credentialUrl,
          }
        : null,
      reminders: i.reminders.map((r) => ({ id: r.id, remindAt: d(r.remindAt), firedAt: dn(r.firedAt) })),
    })),
    relations: relations.map((r) => ({
      id: r.id,
      sourceId: r.sourceId,
      targetId: r.targetId,
      origin: r.origin as "MANUAL" | "WIKILINK",
      createdAt: d(r.createdAt),
    })),
  };
}

// ---- Markdown -------------------------------------------------------------

function yamlString(s: string): string {
  return JSON.stringify(s); // JSON strings are valid YAML scalars
}

/** A .zip of Markdown files, one per item, in folders mirroring yours. */
export async function exportMarkdownZip(): Promise<Uint8Array> {
  const { items, relations, refs } = await loadAll();
  const titleOf = new Map(items.map((i) => [i.id, i.title]));
  const used = new Set<string>();
  const entries: ZipEntry[] = [];

  for (const item of items) {
    const dir = item.archivedAt
      ? ["Archive"]
      : item.folderId && refs.get(item.folderId)
        ? refs.get(item.folderId)!.path.split(" / ").map((p) => safeFileName(p))
        : item.inbox
          ? ["Inbox"]
          : [];
    const base = safeFileName(item.title);
    let file = [...dir, `${base}.md`].join("/");
    for (let n = 2; used.has(file.toLowerCase()); n++) file = [...dir, `${base} (${n}).md`].join("/");
    used.add(file.toLowerCase());

    const meta: string[] = [
      `id: ${item.id}`,
      `type: ${item.type.toLowerCase()}`,
      `title: ${yamlString(item.title)}`,
      `created: ${item.createdAt.toISOString()}`,
      `updated: ${item.updatedAt.toISOString()}`,
    ];
    if (item.tags.length) meta.push(`tags: [${item.tags.map((t) => yamlString(t.tag.name)).join(", ")}]`);
    if (item.folderId && refs.get(item.folderId)) meta.push(`folder: ${yamlString(refs.get(item.folderId)!.path)}`);
    if (item.pinned) meta.push("pinned: true");
    if (item.favorite) meta.push("favorite: true");
    if (item.archivedAt) meta.push(`archived: ${item.archivedAt.toISOString()}`);

    let body = "";
    if (item.task) {
      const t = item.task;
      meta.push(`status: ${t.status.toLowerCase()}`, `priority: ${t.priority.toLowerCase()}`);
      if (t.dueDate) meta.push(`due: ${t.dueDate}${t.dueTime ? ` ${t.dueTime}` : ""}`);
      if (t.recurrence !== "NONE") meta.push(`repeats: ${t.recurrence.toLowerCase()}`);
      if (t.url) meta.push(`url: ${yamlString(t.url)}`);
      if (t.parentId) meta.push(`parent: ${yamlString(titleOf.get(t.parentId) ?? t.parentId)}`);
      if (t.completedAt) meta.push(`completed: ${t.completedAt.toISOString()}`);
      body = `- [${t.status === "DONE" ? "x" : " "}] ${item.title}\n\n${t.description}`;
    } else if (item.note) {
      body = docToMarkdown(parseDoc(item.note.content));
    } else if (item.bookmark) {
      const b = item.bookmark;
      meta.push(`url: ${yamlString(b.url)}`);
      if (b.credentialUrl) meta.push(`password_manager: ${yamlString(b.credentialUrl)}`);
      body = [`[${item.title}](${b.url})`, b.description, b.notes].filter(Boolean).join("\n\n");
    }
    const related = relations
      .filter((r) => r.sourceId === item.id || r.targetId === item.id)
      .map((r) => titleOf.get(r.sourceId === item.id ? r.targetId : r.sourceId))
      .filter((t): t is string => Boolean(t));
    if (related.length) body += `\n\n## Related\n\n${Array.from(new Set(related)).map((t) => `- [[${t}]]`).join("\n")}`;

    entries.push({
      path: file,
      data: `---\n${meta.join("\n")}\n---\n\n# ${item.title}\n\n${body.trim()}\n`,
      date: item.updatedAt,
    });
  }

  entries.unshift({
    path: "README.md",
    data:
      `# Brain export\n\nExported ${new Date().toISOString()}. ${items.length} items.\n\n` +
      "One Markdown file per item, in folders mirroring yours. Front matter holds the metadata;\n" +
      "`[[Title]]` marks a link to another item. For a complete, restorable backup use the JSON export.\n",
  });
  return createZip(entries);
}

// ---- CSV ------------------------------------------------------------------

export type CsvKind = "tasks" | "bookmarks" | "links" | "notes";

export async function exportCsv(kind: CsvKind): Promise<string> {
  const { items, refs } = await loadAll();
  const folder = (fid: string | null) => (fid ? (refs.get(fid)?.path ?? "") : "");
  const tags = (i: (typeof items)[number]) => i.tags.map((t) => t.tag.name).join(" ");
  const base = (i: (typeof items)[number]) => [i.id, i.title, folder(i.folderId), tags(i)];
  const dates = (i: (typeof items)[number]) => [i.createdAt.toISOString(), i.updatedAt.toISOString(), i.archivedAt?.toISOString() ?? ""];
  switch (kind) {
    case "tasks":
      return toCsv(
        ["id", "title", "folder", "tags", "status", "priority", "due_date", "due_time", "repeats", "url", "description", "completed_at", "created_at", "updated_at", "archived_at"],
        items
          .filter((i) => i.task)
          .map((i) => [
            ...base(i),
            i.task!.status,
            i.task!.priority,
            i.task!.dueDate,
            i.task!.dueTime,
            i.task!.recurrence,
            i.task!.url,
            i.task!.description,
            i.task!.completedAt?.toISOString() ?? "",
            ...dates(i),
          ]),
      );
    case "bookmarks":
    case "links":
      return toCsv(
        ["id", "title", "folder", "tags", "url", "domain", "description", "notes", "password_manager_link", "favorite", "created_at", "updated_at", "archived_at"],
        items
          .filter((i) => i.bookmark && i.type === (kind === "links" ? "LINK" : "BOOKMARK"))
          .map((i) => [
            ...base(i),
            i.bookmark!.url,
            i.bookmark!.domain,
            i.bookmark!.description,
            i.bookmark!.notes,
            i.bookmark!.credentialUrl,
            i.favorite,
            ...dates(i),
          ]),
      );
    case "notes":
      return toCsv(
        ["id", "title", "folder", "tags", "text", "created_at", "updated_at", "archived_at"],
        items.filter((i) => i.note).map((i) => [...base(i), i.note!.contentText, ...dates(i)]),
      );
  }
}

// ---- Restore --------------------------------------------------------------

export interface ImportResult {
  folders: number;
  items: number;
  relations: number;
}

/**
 * Restores a JSON export. "merge" adds the backup to what is here, replacing
 * items that share an id; "replace" deletes everything first. Runs in one
 * transaction: a backup that fails validation changes nothing.
 */
export async function importJson(raw: unknown, mode: "merge" | "replace"): Promise<ImportResult> {
  const parsed = exportSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new BadRequestError(
      `This file is not a Brain backup this version can read (${issue?.path.join(".") || "root"}: ${issue?.message}).`,
    );
  }
  const data = parsed.data;
  const uid = await userId();
  const folderIds = new Set(data.folders.map((f) => f.id));
  const itemIds = new Set(data.items.map((i) => i.id));

  await db().$transaction(
    async (tx) => {
      if (mode === "replace") {
        await tx.item.deleteMany({ where: { userId: uid } });
        await tx.folder.deleteMany({ where: { userId: uid } });
        await tx.tag.deleteMany({ where: { userId: uid } });
      }

      // Folders: create flat, then connect parents (order-independent).
      for (const f of data.folders) {
        const row = {
          userId: uid,
          name: f.name,
          position: f.position,
          pinned: f.pinned,
          favorite: f.favorite,
          createdAt: new Date(f.createdAt),
          updatedAt: new Date(f.updatedAt),
        };
        await tx.folder.upsert({ where: { id: f.id }, create: { id: f.id, ...row }, update: { ...row, parentId: null } });
      }
      for (const f of data.folders) {
        if (f.parentId && folderIds.has(f.parentId) && f.parentId !== f.id) {
          await tx.folder.update({ where: { id: f.id }, data: { parentId: f.parentId, updatedAt: new Date(f.updatedAt) } });
        }
      }

      for (const i of data.items) {
        await tx.item.deleteMany({ where: { id: i.id, userId: uid } }); // replaces detail rows cleanly
        const bookmarkUrl = i.bookmark ? normalizeUrl(i.bookmark.url) : null;
        // A bookmark without a usable URL is kept, as a note.
        const type = (i.type === "BOOKMARK" || i.type === "LINK") && !bookmarkUrl ? "NOTE" : i.type;
        await tx.item.create({
          data: {
            id: i.id,
            userId: uid,
            type,
            title: i.title || "Untitled",
            folderId: i.folderId && folderIds.has(i.folderId) ? i.folderId : null,
            pinned: i.pinned,
            favorite: i.favorite,
            inbox: i.inbox,
            createdAt: new Date(i.createdAt),
            updatedAt: new Date(i.updatedAt),
            archivedAt: i.archivedAt ? new Date(i.archivedAt) : null,
          },
        });
        if (type === "TASK") {
          const t = i.task ?? {
            description: i.note?.contentText ?? "",
            status: "TODO" as const,
            priority: "NORMAL" as const,
            dueDate: null,
            dueTime: null,
            url: null,
            recurrence: "NONE" as const,
            parentId: null,
            position: 0,
            completedAt: null,
            lastCompletedAt: null,
          };
          await tx.task.create({
            data: {
              itemId: i.id,
              description: t.description,
              status: t.status,
              priority: t.priority,
              dueDate: t.dueDate,
              dueTime: t.dueTime,
              url: t.url ? normalizeUrl(t.url) : null,
              recurrence: t.recurrence,
              position: t.position,
              completedAt: t.completedAt ? new Date(t.completedAt) : null,
              lastCompletedAt: t.lastCompletedAt ? new Date(t.lastCompletedAt) : null,
            },
          });
        } else if (type === "NOTE") {
          const doc = i.note ? sanitizeDoc(parseDoc(i.note.content)) : parseDoc("");
          const fallback = [i.bookmark?.url, i.bookmark?.description, i.bookmark?.notes].filter(Boolean).join("\n");
          const content = JSON.stringify(doc);
          const text = docToText(doc) || fallback;
          await tx.note.create({ data: { itemId: i.id, content, contentText: text } });
        } else if (i.bookmark && bookmarkUrl) {
          await tx.bookmark.create({
            data: {
              itemId: i.id,
              url: bookmarkUrl,
              domain: i.bookmark.domain,
              faviconUrl: i.bookmark.faviconUrl?.startsWith("data:image/") ? i.bookmark.faviconUrl : null,
              siteTitle: i.bookmark.siteTitle,
              description: i.bookmark.description,
              notes: i.bookmark.notes,
              credentialUrl: i.bookmark.credentialUrl ? normalizeUrl(i.bookmark.credentialUrl, "any") : null,
            },
          });
        }
        if (i.tags.length) await setItemTags(tx, uid, i.id, normalizeTags(i.tags));
        for (const r of i.reminders) {
          await tx.reminder.create({
            data: { id: r.id, itemId: i.id, remindAt: new Date(r.remindAt), firedAt: r.firedAt ? new Date(r.firedAt) : null },
          });
        }
      }
      // Subtask links once every task exists.
      for (const i of data.items) {
        const parentId = i.task?.parentId;
        if (parentId && itemIds.has(parentId) && parentId !== i.id) {
          await tx.task.updateMany({ where: { itemId: i.id }, data: { parentId } });
        }
      }

      for (const r of data.relations) {
        if (!itemIds.has(r.sourceId) || !itemIds.has(r.targetId) || r.sourceId === r.targetId) continue;
        await tx.itemRelation.upsert({
          where: { sourceId_targetId_origin: { sourceId: r.sourceId, targetId: r.targetId, origin: r.origin } },
          create: { id: r.id, sourceId: r.sourceId, targetId: r.targetId, origin: r.origin, createdAt: new Date(r.createdAt) },
          update: {},
        });
      }
      await reindexWhere({ id: { in: Array.from(itemIds) } }, tx);
    },
    { timeout: 120_000, maxWait: 10_000 },
  );

  return { folders: data.folders.length, items: data.items.length, relations: data.relations.length };
}

