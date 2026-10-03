"use client";

import { Bell, Bookmark, CalendarCheck, Folder, Inbox, Pin, StickyNote } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@/client/api";
import { useToday } from "@/client/today";
import { useAppUi } from "@/client/ui-state";
import { CaptureBox } from "@/components/capture-box";
import { ItemList, Section } from "@/components/item-row";
import { Button } from "@/components/ui/button";
import { ErrorBlock, LoadingBlock } from "@/components/ui/misc";
import { formatRelative } from "@/lib/dates";
import type { DashboardData } from "@/lib/types";

function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function SmallEmpty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm text-muted">{children}</p>;
}

export function DashboardView() {
  const today = useToday();
  const ui = useAppUi();
  const { data, error, reload } = useQuery<DashboardData>(`/api/dashboard?today=${today}`);
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm text-muted">{dateLabel}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{greeting()}</h1>
      </div>

      <div className="mb-8">
        <CaptureBox compact />
        {data && data.inboxCount > 0 && (
          <Link href="/inbox" className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted hover:text-accent">
            <Inbox className="size-3.5" /> {data.inboxCount} item{data.inboxCount === 1 ? "" : "s"} in your Inbox to organize
          </Link>
        )}
      </div>

      {error && <ErrorBlock message={error} onRetry={() => void reload()} />}
      {!data && !error && <LoadingBlock />}

      {data && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-x-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div>
            {data.overdue.length > 0 && (
              <Section title="Overdue" count={data.overdue.length}>
                <ItemList items={data.overdue} />
              </Section>
            )}
            <Section
              title="Today"
              count={data.today.length}
              action={
                <Button size="sm" variant="ghost" onClick={() => ui.openQuickAdd("TASK", { dueDate: today })}>
                  + Task for today
                </Button>
              }
            >
              {data.today.length ? (
                <ItemList items={data.today} />
              ) : (
                <SmallEmpty>
                  <CalendarCheck className="mx-auto mb-1 size-5 text-faint" />
                  Nothing due today.
                </SmallEmpty>
              )}
            </Section>
            <Section
              title="Upcoming · next 7 days"
              count={data.upcoming.length}
              action={
                <Link href="/tasks?view=upcoming" className="text-xs text-muted hover:text-accent">
                  All upcoming →
                </Link>
              }
            >
              {data.upcoming.length ? <ItemList items={data.upcoming} /> : <SmallEmpty>No tasks due this week.</SmallEmpty>}
            </Section>
            {data.reminders.length > 0 && (
              <Section title="Reminders">
                <ul className="flex flex-col gap-1">
                  {data.reminders.map((r) => (
                    <li key={r.id}>
                      <Link href={`/items/${r.item.id}`} className="flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-hover">
                        <Bell className="size-3.5 text-faint" />
                        <span className="flex-1 truncate">{r.item.title}</span>
                        <span className="text-xs text-muted">
                          {new Date(r.remindAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </div>

          <div>
            <Section title="Pinned" count={data.pinnedItems.length + data.pinnedFolders.length}>
              {data.pinnedFolders.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {data.pinnedFolders.map((f) => (
                    <Link
                      key={f.id}
                      href={`/folders/${f.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:border-faint"
                    >
                      <Folder className="size-4 text-faint" /> {f.name}
                    </Link>
                  ))}
                </div>
              )}
              {data.pinnedItems.length ? (
                <ItemList items={data.pinnedItems} showType />
              ) : (
                data.pinnedFolders.length === 0 && (
                  <SmallEmpty>
                    <Pin className="mx-auto mb-1 size-5 text-faint" />
                    Pin anything to keep it here.
                  </SmallEmpty>
                )
              )}
            </Section>
            <Section
              title="Recently edited notes"
              action={
                <Link href="/notes" className="text-xs text-muted hover:text-accent">
                  All notes →
                </Link>
              }
            >
              {data.recentNotes.length ? (
                <ul className="flex flex-col">
                  {data.recentNotes.map((n) => (
                    <li key={n.id}>
                      <Link href={`/items/${n.id}`} className="flex items-center gap-2.5 rounded-md px-1 py-1.5 hover:bg-hover">
                        <StickyNote className="size-4 shrink-0 text-amber-500" />
                        <span className="flex-1 truncate text-sm">{n.title}</span>
                        <span className="shrink-0 text-xs text-faint">{formatRelative(n.updatedAt)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <SmallEmpty>No notes yet. Press N to write one.</SmallEmpty>
              )}
            </Section>
            <Section
              title="Recently added bookmarks"
              action={
                <Link href="/bookmarks" className="text-xs text-muted hover:text-accent">
                  All bookmarks →
                </Link>
              }
            >
              {data.recentBookmarks.length ? (
                <ItemList items={data.recentBookmarks} showFolder={false} />
              ) : (
                <SmallEmpty>
                  <Bookmark className="mx-auto mb-1 size-5 text-faint" />
                  Paste a URL in the capture box to save one.
                </SmallEmpty>
              )}
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}
