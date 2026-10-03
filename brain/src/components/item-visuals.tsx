import { Bookmark, CheckSquare, Folder, Globe, Hash, Link2, StickyNote, type LucideIcon } from "lucide-react";
import type { ItemType, Priority, SearchHitKind } from "@/lib/types";
import { TYPE_LABEL } from "@/lib/types";
import { cn } from "@/lib/cn";

export const KIND_ICON: Record<SearchHitKind, LucideIcon> = {
  TASK: CheckSquare,
  NOTE: StickyNote,
  BOOKMARK: Bookmark,
  LINK: Link2,
  FOLDER: Folder,
  TAG: Hash,
};

export const KIND_COLOR: Record<SearchHitKind, string> = {
  TASK: "text-sky-600 dark:text-sky-400",
  NOTE: "text-amber-600 dark:text-amber-400",
  BOOKMARK: "text-violet-600 dark:text-violet-400",
  LINK: "text-emerald-600 dark:text-emerald-400",
  FOLDER: "text-slate-500 dark:text-slate-400",
  TAG: "text-pink-600 dark:text-pink-400",
};

const KIND_BADGE: Record<SearchHitKind, string> = {
  TASK: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  NOTE: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  BOOKMARK: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  LINK: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  FOLDER: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  TAG: "bg-pink-50 text-pink-700 dark:bg-pink-950 dark:text-pink-300",
};

export function KindIcon({ kind, className }: { kind: SearchHitKind; className?: string }) {
  const Icon = KIND_ICON[kind];
  return <Icon aria-hidden className={cn("size-4 shrink-0", KIND_COLOR[kind], className)} />;
}

/** "Task" / "Note" / … label chip, so search results say what they are. */
export function KindBadge({ kind }: { kind: SearchHitKind }) {
  const label = kind === "FOLDER" ? "Folder" : kind === "TAG" ? "Tag" : TYPE_LABEL[kind as ItemType];
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide", KIND_BADGE[kind])}>
      {label}
    </span>
  );
}

export const PRIORITY_STYLE: Record<Priority, string> = {
  URGENT: "text-red-600 dark:text-red-400",
  HIGH: "text-orange-600 dark:text-orange-400",
  NORMAL: "text-muted",
  LOW: "text-faint",
};

/** Site icon: the stored favicon, else the site's initial. */
export function Favicon({ src, domain, className }: { src: string | null | undefined; domain: string; className?: string }) {
  if (src && src.startsWith("data:image/")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className={cn("size-4 shrink-0 rounded-sm", className)} />;
  }
  const letter = domain.replace(/^www\./, "").charAt(0).toUpperCase();
  return letter ? (
    <span
      aria-hidden
      className={cn(
        "grid size-4 shrink-0 place-items-center rounded-sm bg-surface-2 text-[10px] font-semibold text-muted",
        className,
      )}
    >
      {letter}
    </span>
  ) : (
    <Globe aria-hidden className={cn("size-4 shrink-0 text-faint", className)} />
  );
}
