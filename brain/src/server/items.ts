import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { parseCapture, type CaptureMode } from "@/lib/capture";
import { localToday, nextOccurrence } from "@/lib/dates";
import { docToText, extractItemLinks, parseDoc, sanitizeDoc, textToDoc } from "@/lib/rich-text";
import {
  PRIORITY_RANK,
  type FolderRef,
  type ItemDetail,
  type ItemSummary,
  type ItemType,
  type Priority,
  type Recurrence,
  type RelatedItem,
  type TaskStatus,
} from "@/lib/types";
import { domainOf } from "@/lib/url";
import type { CreateItemInput, ListQuery, UpdateItemInput } from "@/lib/validation";
import { db, type Tx } from "./db";
import { BadRequestError, NotFoundError } from "./errors";
import { folderRefs, TOP_LEVEL } from "./folders";
import { reindexWhere } from "./search-index";
import { deleteOrphanTags, setItemTags } from "./tags";
import { userId } from "./user";

// ---- Reading --------------------------------------------------------------

export const SUMMARY_INCLUDE = {
  tags: { include: { tag: { select: { id: true, name: true } } } },
  task: true,
  note: { select: { contentText: true } },
  bookmark: true,
  subtasks: { select: { status: true, item: { select: { archivedAt: true } } } },
} satisfies Prisma.ItemInclude;

type SummaryRow = Prisma.ItemGetPayload<{ include: typeof SUMMARY_INCLUDE }>;

function preview(row: SummaryRow): string {
  const text = row.note?.contentText || row.task?.description || row.bookmark?.description || row.bookmark?.notes || "";
  return text.replace(/\s+/g, " ").trim().slice(0, 220);
}

export function toSummary(row: SummaryRow, folders: Map<string, FolderRef>): ItemSummary {
  const subtasks = row.subtasks.filter((s) => !s.item.archivedAt);
  return {
    id: row.id,
    type: row.type as ItemType,
    title: row.title,
    pinned: row.pinned,
    favorite: row.favorite,
    inbox: row.inbox,
    folder: row.folderId ? (folders.get(row.folderId) ?? null) : null,
    tags: row.tags.map((t) => t.tag).sort((a, b) => a.name.localeCompare(b.name)),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
    preview: preview(row),
    task: row.task
      ? {
          description: row.task.description,
          status: row.task.status as TaskStatus,
          priority: row.task.priority as Priority,
          dueDate: row.task.dueDate,
          dueTime: row.task.dueTime,
          url: row.task.url,
          recurrence: row.task.recurrence as Recurrence,
          parentId: row.task.parentId,
          completedAt: row.task.completedAt?.toISOString() ?? null,
          lastCompletedAt: row.task.lastCompletedAt?.toISOString() ?? null,
          subtaskCount: subtasks.length,
          subtaskDoneCount: subtasks.filter((s) => s.status === "DONE").length,
        }
      : null,
    bookmark: row.bookmark
      ? {
          url: row.bookmark.url,
          domain: row.bookmark.domain,
          faviconUrl: row.bookmark.faviconUrl,
          siteTitle: row.bookmark.siteTitle,
          description: row.bookmark.description,
          notes: row.bookmark.notes,
          credentialUrl: row.bookmark.credentialUrl,
        }
      : null,
  };
}

export async function summaries(where: Prisma.ItemWhereInput, opts: { orderBy?: Prisma.ItemOrderByWithRelationInput[]; take?: number } = {}): Promise<ItemSummary[]> {
  const [rows, folders] = await Promise.all([
    db().item.findMany({
      where: { userId: await userId(), ...where },
      include: SUMMARY_INCLUDE,
      orderBy: opts.orderBy ?? [{ updatedAt: "desc" }],
      take: opts.take,
    }),
    folderRefs(),
  ]);
  return rows.map((r) => toSummary(r, folders));
}

/** Open tasks first by due date (undated last), then time, then priority. */
export function compareByDue(a: ItemSummary, b: ItemSummary): number {
  const ad = a.task?.dueDate ?? "9999-99-99";
  const bd = b.task?.dueDate ?? "9999-99-99";
  if (ad !== bd) return ad < bd ? -1 : 1;
  const at = a.task?.dueTime ?? "99:99";
  const bt = b.task?.dueTime ?? "99:99";
  if (at !== bt) return at < bt ? -1 : 1;
  return comparePriority(a, b);
}

export function comparePriority(a: ItemSummary, b: ItemSummary): number {
  const ap = PRIORITY_RANK[a.task?.priority ?? "NORMAL"];
  const bp = PRIORITY_RANK[b.task?.priority ?? "NORMAL"];
  return ap - bp || b.updatedAt.localeCompare(a.updatedAt);
}

export async function listItems(q: ListQuery): Promise<ItemSummary[]> {
  const today = q.today ?? localToday();
  const where: Prisma.ItemWhereInput = { archivedAt: q.archived ? { not: null } : null };
  const and: Prisma.ItemWhereInput[] = [];
  if (q.type) where.type = q.type;
  if (q.folderId) where.folderId = q.folderId;
  if (q.tag) where.tags = { some: { tag: { name: q.tag } } };
  if (q.favorite) where.favorite = true;
  if (q.pinned) where.pinned = true;
  if (q.inbox) where.inbox = true;

  const task: Prisma.TaskWhereInput = {};
  if (q.status) task.status = q.status;
  if (q.priority) task.priority = q.priority;
  const open = q.status ? q.status : { not: "DONE" };
  switch (q.view) {
    case "today":
      Object.assign(task, { dueDate: today, status: open });
      break;
    case "overdue":
      Object.assign(task, { dueDate: { lt: today }, status: open });
      break;
    case "upcoming":
      Object.assign(task, { dueDate: { gt: today }, status: open });
      break;
    case "completed":
      Object.assign(task, { status: "DONE" });
      break;
    case "open":
      task.status = open;
      break;
  }
  const dated = q.view === "today" || q.view === "overdue" || q.view === "upcoming";
  if (Object.keys(task).length > 0) {
    where.type = "TASK";
    and.push({ task: { is: task } });
  }
  // Subtasks live inside their parent, except when they have their own date.
  if (!dated) and.push(TOP_LEVEL);
  if (and.length) where.AND = and;

  const orderBy: Prisma.ItemOrderByWithRelationInput[] =
    q.sort === "created" ? [{ createdAt: "desc" }] : q.sort === "title" ? [{ title: "asc" }] : [{ updatedAt: "desc" }];
  const items = await summaries(where, { orderBy, take: q.limit ?? 500 });
  if (q.sort === "due" || (!q.sort && dated)) items.sort(compareByDue);
  else if (q.sort === "priority") items.sort(comparePriority);
  if (q.view === "completed" && !q.sort) {
    items.sort((a, b) => (b.task?.completedAt ?? "").localeCompare(a.task?.completedAt ?? ""));
  }
  return items;
}

async function ownItem(id: string, client: Tx | ReturnType<typeof db> = db()) {
  const item = await client.item.findFirst({
    where: { id, userId: await userId() },
    include: { task: true, note: true, bookmark: true },
  });
  if (!item) throw new NotFoundError();
  return item;
}

export async function getItem(id: string): Promise<ItemDetail> {
  const uid = await userId();
  const row = await db().item.findFirst({
    where: { id, userId: uid },
    include: {
      ...SUMMARY_INCLUDE,
      note: true,
      reminders: { orderBy: { remindAt: "asc" } },
      outgoing: { include: { target: { select: { id: true, type: true, title: true, task: { select: { status: true } } } } } },
      incoming: { include: { source: { select: { id: true, type: true, title: true, task: { select: { status: true } } } } } },
    },
  });
  if (!row) throw new NotFoundError();
  const folders = await folderRefs();
  const summary = toSummary(row, folders);

  const related = new Map<string, RelatedItem>();
  for (const r of row.outgoing) {
    const prev = related.get(r.target.id);
    if (prev && prev.origin === "MANUAL") continue;
    related.set(r.target.id, {
      id: r.target.id,
      type: r.target.type as ItemType,
      title: r.target.title,
      origin: r.origin as RelatedItem["origin"],
      direction: "outgoing",
      done: r.target.task?.status === "DONE",
    });
  }
  for (const r of row.incoming) {
    if (related.get(r.source.id)?.origin === "MANUAL") continue;
    if (related.has(r.source.id) && r.origin !== "MANUAL") continue;
    related.set(r.source.id, {
      id: r.source.id,
      type: r.source.type as ItemType,
      title: r.source.title,
      origin: r.origin as RelatedItem["origin"],
      direction: "incoming",
      done: r.source.task?.status === "DONE",
    });
  }

  const subtasks = row.type === "TASK"
    ? (await summaries({ archivedAt: null, task: { is: { parentId: row.id } } }, { orderBy: [{ createdAt: "asc" }] }))
        .sort((a, b) => Number(a.task?.status === "DONE") - Number(b.task?.status === "DONE"))
    : [];
  const parent = row.task?.parentId
    ? await db().item.findFirst({ where: { id: row.task.parentId }, select: { id: true, title: true } })
    : null;

  return {
    ...summary,
    note: row.note ? { content: row.note.content, contentText: row.note.contentText } : null,
    subtasks,
    parent,
    related: Array.from(related.values()).sort((a, b) => a.title.localeCompare(b.title)),
    reminders: row.reminders.map((r) => ({
      id: r.id,
      remindAt: r.remindAt.toISOString(),
      firedAt: r.firedAt?.toISOString() ?? null,
    })),
  };
}

// ---- Writing --------------------------------------------------------------

/** Note content from the API: a TipTap doc as JSON text, made safe. */
function noteContent(content: string | undefined, text: string | undefined): { content: string; contentText: string } {
  const doc = content !== undefined ? sanitizeDoc(parseDoc(content)) : textToDoc(text ?? "");
  return { content: JSON.stringify(doc), contentText: docToText(doc) };
}

function defaultTitle(type: ItemType, url: string | null | undefined, siteTitle?: string | null): string {
  if ((type === "BOOKMARK" || type === "LINK") && url) return siteTitle?.trim() || domainOf(url) || url;
  return type === "TASK" ? "Untitled task" : "Untitled";
}

async function assertFolder(tx: Tx, uid: string, folderId: string | null | undefined): Promise<void> {
  if (!folderId) return;
  if (!(await tx.folder.findFirst({ where: { id: folderId, userId: uid }, select: { id: true } }))) {
    throw new NotFoundError("Folder");
  }
}

async function assertParentTask(tx: Tx, uid: string, parentId: string, selfId?: string): Promise<void> {
  if (parentId === selfId) throw new BadRequestError("A task cannot be its own subtask.");
  const parent = await tx.item.findFirst({ where: { id: parentId, userId: uid, type: "TASK" }, include: { task: true } });
  if (!parent) throw new NotFoundError("Parent task");
  if (parent.task?.parentId) throw new BadRequestError("Subtasks cannot have their own subtasks.");
}

/** `[[Title]]` references in plain text. */
export function wikiTitles(text: string): string[] {
  return Array.from(new Set(Array.from(text.matchAll(/\[\[([^[\]\n]{1,200})\]\]/g), (m) => m[1]!.trim()).filter(Boolean)));
}

async function resolveTitles(tx: Tx, uid: string, titles: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const title of titles) {
    const lower = title.toLowerCase();
    const candidates = await tx.item.findMany({
      where: { userId: uid, searchText: { contains: lower } },
      select: { id: true, title: true, archivedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    const match =
      candidates.find((c) => c.title.toLowerCase() === lower && !c.archivedAt) ??
      candidates.find((c) => c.title.toLowerCase() === lower);
    if (match) ids.push(match.id);
  }
  return ids;
}

/** Makes this item's WIKILINK relations match the links in its text. */
async function syncWikiLinks(tx: Tx, uid: string, sourceId: string, targetIds: string[]): Promise<void> {
  const valid = targetIds.length
    ? (await tx.item.findMany({ where: { id: { in: targetIds }, userId: uid }, select: { id: true } }))
        .map((i) => i.id)
        .filter((id) => id !== sourceId)
    : [];
  await tx.itemRelation.deleteMany({ where: { sourceId, origin: "WIKILINK", targetId: { notIn: valid } } });
  for (const targetId of valid) {
    await tx.itemRelation.upsert({
      where: { sourceId_targetId_origin: { sourceId, targetId, origin: "WIKILINK" } },
      create: { sourceId, targetId, origin: "WIKILINK" },
      update: {},
    });
  }
}

async function syncLinksFor(tx: Tx, uid: string, itemId: string): Promise<void> {
  const item = await tx.item.findUniqueOrThrow({ where: { id: itemId }, include: { task: true, note: true, bookmark: true } });
  let targets: string[] = [];
  if (item.note) targets = extractItemLinks(parseDoc(item.note.content));
  const text = [item.task?.description, item.bookmark?.notes, item.bookmark?.description].filter(Boolean).join("\n");
  if (text) targets = targets.concat(await resolveTitles(tx, uid, wikiTitles(text)));
  await syncWikiLinks(tx, uid, itemId, targets);
}

async function setReminder(tx: Tx, itemId: string, remindAt: string | null): Promise<void> {
  await tx.reminder.deleteMany({ where: { itemId, firedAt: null } });
  if (remindAt) await tx.reminder.create({ data: { itemId, remindAt: new Date(remindAt) } });
}

export async function createItem(input: CreateItemInput): Promise<ItemDetail> {
  const uid = await userId();
  const type = input.type;
  if ((type === "BOOKMARK" || type === "LINK") && !input.url) {
    throw new BadRequestError(`A ${type === "LINK" ? "link" : "bookmark"} needs a URL.`);
  }
  const now = new Date();
  const id = await db().$transaction(async (tx) => {
    await assertFolder(tx, uid, input.folderId);
    if (type === "TASK" && input.parentId) await assertParentTask(tx, uid, input.parentId);
    const status: TaskStatus = input.status ?? (input.inbox ? "INBOX" : "TODO");
    const inbox = input.inbox ?? (type === "TASK" && status === "INBOX");
    const item = await tx.item.create({
      data: {
        userId: uid,
        type,
        title: input.title?.trim() || defaultTitle(type, input.url, input.siteTitle),
        folderId: input.folderId ?? null,
        pinned: input.pinned ?? false,
        favorite: input.favorite ?? false,
        inbox,
        createdAt: now,
        updatedAt: now,
      },
    });
    if (type === "TASK") {
      await tx.task.create({
        data: {
          itemId: item.id,
          description: input.description ?? input.text ?? "",
          status,
          priority: input.priority ?? "NORMAL",
          dueDate: input.dueDate ?? null,
          dueTime: input.dueTime ?? null,
          url: input.url ?? null,
          recurrence: input.recurrence ?? "NONE",
          parentId: input.parentId ?? null,
          completedAt: status === "DONE" ? now : null,
        },
      });
    } else if (type === "NOTE") {
      await tx.note.create({ data: { itemId: item.id, ...noteContent(input.content, input.text ?? input.description) } });
    } else {
      const url = input.url!;
      await tx.bookmark.create({
        data: {
          itemId: item.id,
          url,
          domain: domainOf(url),
          faviconUrl: input.faviconUrl ?? null,
          siteTitle: input.siteTitle ?? null,
          description: input.description ?? "",
          notes: input.notes ?? input.text ?? "",
          credentialUrl: input.credentialUrl ?? null,
        },
      });
    }
    if (input.tags?.length) await setItemTags(tx, uid, item.id, input.tags);
    if (input.remindAt) await setReminder(tx, item.id, input.remindAt);
    await syncLinksFor(tx, uid, item.id);
    await reindexWhere({ id: item.id }, tx);
    return item.id;
  });
  return getItem(id);
}

/** Text carried over when an item changes type. */
function carriedText(item: Awaited<ReturnType<typeof ownItem>>): string {
  return (
    item.note?.contentText ||
    item.task?.description ||
    [item.bookmark?.description, item.bookmark?.notes].filter(Boolean).join("\n\n") ||
    ""
  );
}

export async function updateItem(id: string, patch: UpdateItemInput): Promise<ItemDetail> {
  const uid = await userId();
  const now = new Date();
  await db().$transaction(async (tx) => {
    let item = await ownItem(id, tx);

    // Changing type (e.g. an inbox note that turns out to be a task).
    if (patch.type && patch.type !== item.type) {
      const to = patch.type;
      const text = carriedText(item);
      const url = patch.url ?? item.bookmark?.url ?? item.task?.url ?? null;
      const bookmarkLike = (t: string) => t === "BOOKMARK" || t === "LINK";
      if (bookmarkLike(to) && !url) throw new BadRequestError("Add a URL before turning this into a bookmark or link.");
      if (!(bookmarkLike(to) && bookmarkLike(item.type))) {
        if (item.task) {
          await tx.item.deleteMany({ where: { task: { is: { parentId: id } } } });
          await tx.task.delete({ where: { itemId: id } });
        }
        if (item.note) await tx.note.delete({ where: { itemId: id } });
        if (item.bookmark) await tx.bookmark.delete({ where: { itemId: id } });
        if (to === "TASK") {
          await tx.task.create({
            data: { itemId: id, description: text, url, status: item.inbox ? "INBOX" : "TODO" },
          });
        } else if (to === "NOTE") {
          const body = [text, item.bookmark?.url].filter(Boolean).join("\n\n");
          await tx.note.create({ data: { itemId: id, ...noteContent(undefined, body) } });
        } else {
          await tx.bookmark.create({ data: { itemId: id, url: url!, domain: domainOf(url!), notes: text } });
        }
      }
      await tx.item.update({ where: { id }, data: { type: to, updatedAt: now } });
      item = await ownItem(id, tx);
    }

    // Shared fields.
    const data: Prisma.ItemUpdateInput = {};
    const isEdit = Object.keys(patch).some((k) => !["pinned", "favorite", "archived", "inbox"].includes(k));
    if (isEdit) data.updatedAt = now;
    if (patch.title !== undefined) data.title = patch.title.trim() || defaultTitle(item.type as ItemType, item.bookmark?.url);
    if (patch.folderId !== undefined) {
      await assertFolder(tx, uid, patch.folderId);
      data.folder = patch.folderId ? { connect: { id: patch.folderId } } : { disconnect: true };
    }
    if (patch.pinned !== undefined) data.pinned = patch.pinned;
    if (patch.favorite !== undefined) data.favorite = patch.favorite;
    if (patch.archived !== undefined) data.archivedAt = patch.archived ? (item.archivedAt ?? now) : null;
    if (patch.inbox !== undefined) data.inbox = patch.inbox;

    // Task fields.
    if (item.task) {
      const t: Prisma.TaskUpdateInput = {};
      if (patch.description !== undefined) t.description = patch.description;
      if (patch.priority !== undefined) t.priority = patch.priority;
      if (patch.dueDate !== undefined) t.dueDate = patch.dueDate;
      if (patch.dueTime !== undefined) t.dueTime = patch.dueTime;
      if (patch.url !== undefined) t.url = patch.url;
      if (patch.recurrence !== undefined) t.recurrence = patch.recurrence;
      if (patch.parentId !== undefined) {
        if (patch.parentId) {
          await assertParentTask(tx, uid, patch.parentId, id);
          if (await tx.task.count({ where: { parentId: id } })) {
            throw new BadRequestError("A task that has subtasks cannot become a subtask.");
          }
        }
        t.parent = patch.parentId ? { connect: { id: patch.parentId } } : { disconnect: true };
      }
      if (patch.status !== undefined && patch.status !== item.task.status) {
        t.status = patch.status;
        t.completedAt = patch.status === "DONE" ? now : null;
        if (patch.status === "INBOX") data.inbox = true;
        else if (item.task.status === "INBOX" && patch.inbox === undefined) data.inbox = false;
      }
      // Leaving the inbox means the task is now an ordinary to-do.
      if (patch.inbox === false && item.task.status === "INBOX" && patch.status === undefined) t.status = "TODO";
      if (Object.keys(t).length) await tx.task.update({ where: { itemId: id }, data: t });
    }

    // Note fields.
    if (item.note && (patch.content !== undefined || patch.text !== undefined)) {
      await tx.note.update({ where: { itemId: id }, data: noteContent(patch.content, patch.text) });
    }

    // Bookmark / link fields.
    if (item.bookmark) {
      const b: Prisma.BookmarkUpdateInput = {};
      if (patch.url !== undefined) {
        if (!patch.url) throw new BadRequestError("A bookmark needs a URL.");
        b.url = patch.url;
        b.domain = domainOf(patch.url);
      }
      if (patch.description !== undefined) b.description = patch.description;
      if (patch.notes !== undefined) b.notes = patch.notes;
      if (patch.credentialUrl !== undefined) b.credentialUrl = patch.credentialUrl;
      if (patch.faviconUrl !== undefined) b.faviconUrl = patch.faviconUrl;
      if (patch.siteTitle !== undefined) b.siteTitle = patch.siteTitle;
      if (Object.keys(b).length) await tx.bookmark.update({ where: { itemId: id }, data: b });
    }

    await tx.item.update({ where: { id }, data });
    if (patch.archived !== undefined) {
      // Subtasks follow their parent into (and out of) the archive.
      await tx.item.updateMany({
        where: { task: { is: { parentId: id } } },
        data: { archivedAt: patch.archived ? now : null },
      });
    }
    if (patch.tags !== undefined) await setItemTags(tx, uid, id, patch.tags);
    if (patch.remindAt !== undefined) await setReminder(tx, id, patch.remindAt);
    if (
      patch.content !== undefined ||
      patch.text !== undefined ||
      patch.description !== undefined ||
      patch.notes !== undefined ||
      patch.type !== undefined
    ) {
      await syncLinksFor(tx, uid, id);
    }
    await reindexWhere({ id }, tx);
  });
  return getItem(id);
}

/**
 * Checks a task off (or back on). A recurring task is not closed: it moves
 * to its next date and its subtasks reset, ready for the next round.
 */
export async function setTaskDone(id: string, done: boolean, today: string = localToday()): Promise<ItemDetail> {
  const item = await ownItem(id);
  if (!item.task) throw new BadRequestError("Only tasks can be completed.");
  const now = new Date();
  const task = item.task;
  await db().$transaction(async (tx) => {
    if (done && task.recurrence !== "NONE") {
      await tx.task.update({
        where: { itemId: id },
        data: {
          dueDate: nextOccurrence(task.dueDate, task.recurrence as Recurrence, today),
          lastCompletedAt: now,
          status: task.status === "INBOX" || task.status === "DONE" ? "TODO" : task.status,
          completedAt: null,
        },
      });
      await tx.task.updateMany({ where: { parentId: id }, data: { status: "TODO", completedAt: null } });
    } else {
      await tx.task.update({
        where: { itemId: id },
        data: done ? { status: "DONE", completedAt: now } : { status: "TODO", completedAt: null },
      });
    }
    await tx.item.update({ where: { id }, data: { updatedAt: now, ...(done ? { inbox: false } : {}) } });
  });
  return getItem(id);
}

export async function deleteItem(id: string): Promise<void> {
  await ownItem(id);
  await db().$transaction(async (tx) => {
    // Subtasks are items too; their Task rows cascade but the items would not.
    await tx.item.deleteMany({ where: { task: { is: { parentId: id } } } });
    await tx.item.delete({ where: { id } });
    await deleteOrphanTags(tx);
  });
}

export async function captureItem(text: string, mode: CaptureMode = "AUTO"): Promise<ItemDetail> {
  const parsed = parseCapture(text, mode);
  if (!parsed) throw new BadRequestError("Nothing to capture.");
  return createItem({
    type: parsed.type,
    title: parsed.title,
    url: parsed.url,
    tags: parsed.tags,
    inbox: true,
    ...(parsed.type === "TASK" ? { description: parsed.body, status: "INBOX" as const } : {}),
    ...(parsed.type === "NOTE" ? { text: parsed.body } : {}),
    ...(parsed.type === "BOOKMARK" || parsed.type === "LINK" ? { notes: parsed.body } : {}),
  });
}

// ---- Relations ------------------------------------------------------------

export async function addRelation(sourceId: string, targetId: string): Promise<void> {
  if (sourceId === targetId) throw new BadRequestError("An item cannot be related to itself.");
  await ownItem(sourceId);
  await ownItem(targetId);
  const existing = await db().itemRelation.findFirst({
    where: {
      origin: "MANUAL",
      OR: [
        { sourceId, targetId },
        { sourceId: targetId, targetId: sourceId },
      ],
    },
  });
  if (!existing) await db().itemRelation.create({ data: { sourceId, targetId, origin: "MANUAL" } });
}

/** Removes a manual link in either direction. [[Links]] in text stay. */
export async function removeRelation(a: string, b: string): Promise<void> {
  await ownItem(a);
  await db().itemRelation.deleteMany({
    where: {
      origin: "MANUAL",
      OR: [
        { sourceId: a, targetId: b },
        { sourceId: b, targetId: a },
      ],
    },
  });
}
