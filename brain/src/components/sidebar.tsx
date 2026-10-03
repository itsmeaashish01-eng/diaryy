"use client";

import {
  Bookmark,
  Brain,
  CalendarDays,
  CheckSquare,
  Folder,
  Hash,
  Home,
  Inbox,
  Link2,
  Plus,
  Settings,
  Star,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@/client/api";
import { useToday } from "@/client/today";
import { useAppUi } from "@/client/ui-state";
import { cn } from "@/lib/cn";
import type { Counts } from "@/lib/types";
import { SidebarFolderTree } from "./folder-tree";

const NAV: { href: string; label: string; icon: LucideIcon; count?: keyof Counts }[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/inbox", label: "Inbox", icon: Inbox, count: "inbox" },
  { href: "/today", label: "Today", icon: CalendarDays, count: "today" },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/notes", label: "Notes", icon: StickyNote },
  { href: "/bookmarks", label: "Bookmarks", icon: Bookmark },
  { href: "/links", label: "Links", icon: Link2 },
  { href: "/favorites", label: "Favorites", icon: Star },
];

function NavLink({
  href,
  label,
  icon: Icon,
  badge,
  urgent,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  urgent?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
        active ? "bg-hover font-medium text-text" : "text-muted hover:bg-hover hover:text-text",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className={cn("text-xs tabular-nums", urgent ? "font-semibold text-danger" : "text-faint")}>{badge}</span>
      )}
    </Link>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const today = useToday();
  const { data: counts } = useQuery<Counts>(`/api/counts?today=${today}`);
  const ui = useAppUi();

  return (
    <nav aria-label="Main" className="flex h-full flex-col gap-4 overflow-y-auto px-3 py-4">
      <div className="flex items-center justify-between px-2">
        <Link href="/" onClick={onNavigate} className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid size-7 place-items-center rounded-lg bg-accent text-accent-fg">
            <Brain className="size-4" />
          </span>
          Brain
        </Link>
        <button
          onClick={() => {
            onNavigate?.();
            ui.openQuickAdd();
          }}
          title="Quick add (Q)"
          aria-label="Quick add"
          className="grid size-7 place-items-center rounded-md bg-accent text-accent-fg hover:opacity-90"
        >
          <Plus className="size-4" />
        </button>
      </div>

      <div className="flex flex-col gap-0.5">
        {NAV.map((n) => (
          <NavLink
            key={n.href}
            href={n.href}
            label={n.label}
            icon={n.icon}
            onNavigate={onNavigate}
            badge={
              n.count === "today" && counts ? counts.today + counts.overdue : n.count && counts ? counts[n.count] : undefined
            }
            urgent={n.count === "today" && (counts?.overdue ?? 0) > 0}
          />
        ))}
      </div>

      <div>
        <NavLink href="/folders" label="Folders" icon={Folder} onNavigate={onNavigate} />
        <SidebarFolderTree onNavigate={onNavigate} />
      </div>

      <div className="mt-auto flex flex-col gap-0.5">
        <NavLink href="/tags" label="Tags" icon={Hash} onNavigate={onNavigate} />
        <NavLink href="/settings" label="Settings" icon={Settings} onNavigate={onNavigate} />
      </div>
    </nav>
  );
}
