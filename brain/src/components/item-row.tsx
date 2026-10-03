"use client";

import { Archive, ArchiveRestore, ExternalLink, KeyRound, ListChecks, Pin, Repeat, Star } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useItemActions } from "@/client/item-actions";
import { useToday } from "@/client/today";
import { cn } from "@/lib/cn";
import { formatDueDate, formatRelative, formatTime } from "@/lib/dates";
import type { ItemSummary } from "@/lib/types";
import { PRIORITY_LABEL, STATUS_LABEL } from "@/lib/types";
import { isSafeHref } from "@/lib/url";
import { Favicon, KindBadge, KindIcon, PRIORITY_STYLE } from "./item-visuals";

export function TaskCheckbox({ item, className }: { item: ItemSummary; className?: string }) {
  const actions = useItemActions();
  const done = item.task?.status === "DONE";
  const urgent = item.task?.priority === "URGENT" || item.task?.priority === "HIGH";
  return (
    <button
      role="checkbox"
      aria-checked={done}
      aria-label={done ? `Mark “${item.title}” as not done` : `Complete “${item.title}”`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void actions.toggleDone(item);
      }}
      className={cn(
        "grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px] transition-colors",
        done
          ? "border-accent bg-accent text-accent-fg"
          : urgent
            ? "border-orange-500 hover:bg-orange-500/10"
            : "border-faint hover:border-accent hover:bg-accent-soft",
        className,
      )}
    >
      {done && (
        <svg viewBox="0 0 12 12" className="size-2.5" aria-hidden>
          <path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}

function Chip({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 text-xs whitespace-nowrap text-muted", className)}>
      {children}
    </span>
  );
}

export function DueChip({ date, time, done }: { date: string; time: string | null; done: boolean }) {
  const today = useToday();
  const overdue = !done && date < today;
  const isToday = date === today;
  return (
    <Chip className={cn(!done && overdue && "font-medium text-danger", !done && isToday && "font-medium text-ok")}>
      {formatDueDate(date, today)}
      {time && ` ${formatTime(time)}`}
    </Chip>
  );
}

export function ItemRow({
  item,
  showType = false,
  showFolder = true,
  extra,
}: {
  item: ItemSummary;
  showType?: boolean;
  showFolder?: boolean;
  extra?: ReactNode;
}) {
  const router = useRouter();
  const actions = useItemActions();
  const task = item.task;
  const done = task?.status === "DONE";
  const href = `/items/${item.id}`;
  const url = item.bookmark?.url ?? task?.url ?? null;

  return (
    <div
      className="group relative flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-hover"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button,input,select")) return;
        router.push(href);
      }}
    >
      <div className="pt-0.5">
        {task ? (
          <TaskCheckbox item={item} />
        ) : item.bookmark ? (
          <Favicon src={item.bookmark.faviconUrl} domain={item.bookmark.domain} className="mt-0.5" />
        ) : (
          <KindIcon kind={item.type} className="mt-0.5" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {showType && <KindBadge kind={item.type} />}
          <Link
            href={href}
            className={cn("truncate text-[15px] leading-snug font-medium", done && "text-faint line-through")}
          >
            {item.title}
          </Link>
          {item.pinned && <Pin aria-label="Pinned" className="size-3 shrink-0 fill-current text-accent" />}
          {item.favorite && <Star aria-label="Favorite" className="size-3 shrink-0 fill-amber-400 text-amber-400" />}
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {task?.dueDate && <DueChip date={task.dueDate} time={task.dueTime} done={done} />}
          {task && task.priority !== "NORMAL" && (
            <Chip className={PRIORITY_STYLE[task.priority]}>{PRIORITY_LABEL[task.priority]}</Chip>
          )}
          {task && task.status !== "TODO" && task.status !== "DONE" && <Chip>{STATUS_LABEL[task.status]}</Chip>}
          {task && task.recurrence !== "NONE" && (
            <Chip title="Repeats">
              <Repeat className="size-3" />
            </Chip>
          )}
          {task && task.subtaskCount > 0 && (
            <Chip title="Subtasks">
              <ListChecks className="size-3" />
              {task.subtaskDoneCount}/{task.subtaskCount}
            </Chip>
          )}
          {item.bookmark && <Chip>{item.bookmark.domain}</Chip>}
          {item.bookmark?.credentialUrl && (
            <Chip title="Login stored in your password manager">
              <KeyRound className="size-3" />
            </Chip>
          )}
          {!task && !item.bookmark && <Chip>{formatRelative(item.updatedAt)}</Chip>}
          {showFolder && item.folder && (
            <Link href={`/folders/${item.folder.id}`} className="text-xs text-muted hover:text-text hover:underline">
              {item.folder.path}
            </Link>
          )}
          {item.tags.map((t) => (
            <Link
              key={t.id}
              href={`/tags/${encodeURIComponent(t.name)}`}
              className="text-xs text-accent/80 hover:text-accent hover:underline"
            >
              #{t.name}
            </Link>
          ))}
        </div>
        {item.preview && !task && (
          <p className="mt-0.5 line-clamp-1 text-sm text-muted">{item.preview}</p>
        )}
        {extra}
      </div>

      <div className="flex shrink-0 items-center gap-0.5 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
        {url && isSafeHref(url) && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open ${url}`}
            aria-label="Open website"
            className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-accent"
          >
            <ExternalLink className="size-4" />
          </a>
        )}
        <button
          title={item.pinned ? "Unpin" : "Pin to Home"}
          aria-label={item.pinned ? "Unpin" : "Pin"}
          aria-pressed={item.pinned}
          onClick={() => void actions.togglePin(item)}
          className="hidden rounded-md p-1.5 text-muted hover:bg-surface hover:text-text sm:block"
        >
          <Pin className={cn("size-4", item.pinned && "fill-current text-accent")} />
        </button>
        <button
          title={item.favorite ? "Remove from Favorites" : "Add to Favorites"}
          aria-label={item.favorite ? "Unfavorite" : "Favorite"}
          aria-pressed={item.favorite}
          onClick={() => void actions.toggleFavorite(item)}
          className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-text"
        >
          <Star className={cn("size-4", item.favorite && "fill-amber-400 text-amber-400")} />
        </button>
        <button
          title={item.archivedAt ? "Restore" : "Archive"}
          aria-label={item.archivedAt ? "Restore" : "Archive"}
          onClick={() => void actions.archive(item, !item.archivedAt)}
          className="hidden rounded-md p-1.5 text-muted hover:bg-surface hover:text-text sm:block"
        >
          {item.archivedAt ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
        </button>
      </div>
    </div>
  );
}

export function ItemList({ items, showType, showFolder }: { items: ItemSummary[]; showType?: boolean; showFolder?: boolean }) {
  return (
    <div className="-mx-3 flex flex-col">
      {items.map((item) => (
        <ItemRow key={item.id} item={item} showType={showType} showFolder={showFolder} />
      ))}
    </div>
  );
}

export function Section({ title, count, children, action }: { title: string; count?: number; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">
          {title}
          {count !== undefined && <span className="ml-2 font-normal text-faint">{count}</span>}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
