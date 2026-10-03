import "server-only";
import { addDays, localToday } from "@/lib/dates";
import type { Counts, DashboardData, ItemType } from "@/lib/types";
import { db } from "./db";
import { listFolders, TOP_LEVEL } from "./folders";
import { compareByDue, summaries } from "./items";
import { userId } from "./user";

const OPEN = { status: { not: "DONE" } };

export async function dashboard(today: string = localToday()): Promise<DashboardData> {
  const uid = await userId();
  const weekAhead = addDays(today, 7);
  const [overdue, dueToday, upcoming, recentNotes, recentBookmarks, pinnedItems, folders, inboxCount, reminders] =
    await Promise.all([
      summaries({ archivedAt: null, task: { is: { ...OPEN, dueDate: { lt: today } } } }),
      summaries({ archivedAt: null, task: { is: { ...OPEN, dueDate: today } } }),
      summaries({ archivedAt: null, task: { is: { ...OPEN, dueDate: { gt: today, lte: weekAhead } } } }),
      summaries({ archivedAt: null, type: "NOTE" }, { orderBy: [{ updatedAt: "desc" }], take: 6 }),
      summaries({ archivedAt: null, type: { in: ["BOOKMARK", "LINK"] } }, { orderBy: [{ createdAt: "desc" }], take: 6 }),
      summaries({ archivedAt: null, pinned: true, ...TOP_LEVEL }, { orderBy: [{ updatedAt: "desc" }], take: 24 }),
      listFolders(),
      db().item.count({ where: { userId: uid, inbox: true, archivedAt: null } }),
      db().reminder.findMany({
        where: { firedAt: null, item: { userId: uid, archivedAt: null } },
        orderBy: { remindAt: "asc" },
        take: 5,
        include: { item: { select: { id: true, title: true, type: true } } },
      }),
    ]);
  return {
    overdue: overdue.sort(compareByDue),
    today: dueToday.sort(compareByDue),
    upcoming: upcoming.sort(compareByDue),
    recentNotes,
    recentBookmarks,
    pinnedItems,
    pinnedFolders: folders.filter((f) => f.pinned),
    inboxCount,
    reminders: reminders.map((r) => ({
      id: r.id,
      remindAt: r.remindAt.toISOString(),
      item: { id: r.item.id, title: r.item.title, type: r.item.type as ItemType },
    })),
  };
}

export async function counts(today: string = localToday()): Promise<Counts> {
  const uid = await userId();
  const base = { userId: uid, archivedAt: null };
  const [inbox, dueToday, overdue] = await Promise.all([
    db().item.count({ where: { ...base, inbox: true } }),
    db().item.count({ where: { ...base, task: { is: { ...OPEN, dueDate: today } } } }),
    db().item.count({ where: { ...base, task: { is: { ...OPEN, dueDate: { lt: today } } } } }),
  ]);
  return { inbox, today: dueToday, overdue };
}

/** Reminders whose time has come and that have not been shown yet. */
export async function dueReminders(now: Date = new Date()) {
  const uid = await userId();
  const rows = await db().reminder.findMany({
    where: { firedAt: null, remindAt: { lte: now }, item: { userId: uid, archivedAt: null } },
    orderBy: { remindAt: "asc" },
    include: { item: { select: { id: true, title: true, type: true } } },
  });
  return rows.map((r) => ({ id: r.id, remindAt: r.remindAt.toISOString(), item: r.item }));
}

export async function dismissReminder(id: string): Promise<void> {
  const uid = await userId();
  await db().reminder.updateMany({ where: { id, item: { userId: uid } }, data: { firedAt: new Date() } });
}
