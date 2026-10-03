"use client";

import { Command } from "cmdk";
import {
  ArrowRight,
  Bell,
  Bookmark,
  CalendarDays,
  CheckSquare,
  Download,
  Folder,
  Hash,
  Home,
  Inbox,
  Keyboard,
  Link2,
  Moon,
  Search,
  Settings,
  Star,
  StickyNote,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, mutate } from "@/client/api";
import { setTheme } from "@/client/theme";
import { useToast } from "@/client/toast";
import type { QuickAddKind } from "@/client/ui-state";
import { tokenize } from "@/lib/search";
import type { ItemDetail, SearchHit } from "@/lib/types";
import { Highlight } from "./highlight";
import { KindBadge, KindIcon } from "./item-visuals";
import { Kbd } from "./ui/misc";

interface PaletteCommand {
  id: string;
  label: string;
  icon: LucideIcon;
  keywords?: string;
  shortcut?: string;
  run: () => void;
}

/** Starts a file download from an API route without leaving the page. */
function download(href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function CommandPalette({
  open,
  onOpenChange,
  initialQuery,
  onQuickAdd,
  onShortcuts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuery: string;
  onQuickAdd: (kind: QuickAddKind) => void;
  onShortcuts: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<{ for: string; hits: SearchHit[] }>({ for: "", hits: [] });
  const debounced = useDebounced(query, 90).trim();

  // Each opening starts from the query it was opened with.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setQuery(initialQuery);
  }

  useEffect(() => {
    if (!open || !debounced) return;
    let cancelled = false;
    api<SearchHit[]>(`/api/search?q=${encodeURIComponent(debounced)}&limit=25`)
      .then((hits) => !cancelled && setResults({ for: debounced, hits }))
      .catch(() => !cancelled && setResults({ for: debounced, hits: [] }));
    return () => {
      cancelled = true;
    };
  }, [debounced, open]);

  const hits = query.trim() && results.for ? results.hits : [];
  const searching = Boolean(query.trim()) && results.for !== query.trim();

  // Highlight the best match whenever new results arrive, so Enter opens it.
  const [selected, setSelected] = useState("");
  const [selectedFor, setSelectedFor] = useState<{ for: string; hits: SearchHit[] } | null>(null);
  if (selectedFor !== results) {
    setSelectedFor(results);
    const first = results.hits[0];
    if (first) setSelected(`hit-${first.kind}-${first.id}`);
  }

  const close = () => onOpenChange(false);
  const go = (href: string) => {
    close();
    router.push(href);
  };

  const commands = useMemo<PaletteCommand[]>(
    () => [
      { id: "new-task", label: "Create task", icon: CheckSquare, shortcut: "T", keywords: "add todo new", run: () => onQuickAdd("TASK") },
      { id: "new-note", label: "Create note", icon: StickyNote, shortcut: "N", keywords: "add new write", run: () => onQuickAdd("NOTE") },
      { id: "new-bookmark", label: "Add bookmark", icon: Bookmark, shortcut: "B", keywords: "save url website new", run: () => onQuickAdd("BOOKMARK") },
      { id: "new-link", label: "Add link", icon: Link2, keywords: "vault portal url new", run: () => onQuickAdd("LINK") },
      { id: "new-reminder", label: "Add reminder", icon: Bell, keywords: "alert remind new", run: () => onQuickAdd("REMINDER") },
      { id: "new-folder", label: "Create folder", icon: Folder, keywords: "category new", run: () => onQuickAdd("FOLDER") },
      { id: "search", label: "Search everything", icon: Search, keywords: "find", run: () => go("/search") },
      { id: "go-home", label: "Go to Home", icon: Home, shortcut: "G H", keywords: "dashboard", run: () => go("/") },
      { id: "go-today", label: "Go to Today", icon: CalendarDays, shortcut: "G T", keywords: "due overdue", run: () => go("/today") },
      { id: "go-inbox", label: "Go to Inbox", icon: Inbox, shortcut: "G I", keywords: "capture", run: () => go("/inbox") },
      { id: "go-tasks", label: "Go to Tasks", icon: CheckSquare, keywords: "todo", run: () => go("/tasks") },
      { id: "go-notes", label: "Go to Notes", icon: StickyNote, run: () => go("/notes") },
      { id: "go-bookmarks", label: "Go to Bookmarks", icon: Bookmark, run: () => go("/bookmarks") },
      { id: "go-links", label: "Go to Links", icon: Link2, keywords: "vault", run: () => go("/links") },
      { id: "go-favorites", label: "Go to Favorites", icon: Star, shortcut: "G F", keywords: "starred pinned", run: () => go("/favorites") },
      { id: "go-folders", label: "Go to Folders", icon: Folder, keywords: "categories", run: () => go("/folders") },
      { id: "go-tags", label: "Go to Tags", icon: Hash, run: () => go("/tags") },
      { id: "go-settings", label: "Open Settings", icon: Settings, shortcut: "G S", keywords: "preferences theme", run: () => go("/settings") },
      { id: "export", label: "Export backup (JSON)", icon: Download, keywords: "download backup", run: () => { close(); download("/api/export?format=json"); } },
      { id: "theme-light", label: "Theme: Light", icon: Sun, keywords: "appearance mode", run: () => { setTheme("light"); close(); } },
      { id: "theme-dark", label: "Theme: Dark", icon: Moon, keywords: "appearance mode", run: () => { setTheme("dark"); close(); } },
      { id: "theme-system", label: "Theme: System", icon: Settings, keywords: "appearance mode auto", run: () => { setTheme("system"); close(); } },
      { id: "shortcuts", label: "Keyboard shortcuts", icon: Keyboard, shortcut: "?", keywords: "help keys", run: () => { close(); onShortcuts(); } },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onQuickAdd, onShortcuts],
  );

  const q = query.trim().toLowerCase();
  const tokens = tokenize(query);
  const matchingCommands = q
    ? commands.filter((c) => `${c.label} ${c.keywords ?? ""}`.toLowerCase().includes(q))
    : commands;

  async function quickCreate(type: "TASK" | "NOTE") {
    try {
      const item = await mutate<ItemDetail>("/api/items", { method: "POST", body: { type, title: query.trim() } });
      go(`/items/${item.id}`);
    } catch (e) {
      toast.error(e);
    }
  }

  async function capture() {
    try {
      await mutate("/api/capture", { method: "POST", body: { text: query } });
      close();
      toast.show("Captured to Inbox", { tone: "success", action: { label: "Open Inbox", onClick: () => router.push("/inbox") } });
    } catch (e) {
      toast.error(e);
    }
  }

  const itemClass =
    "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm aria-selected:bg-hover data-[selected=true]:bg-hover";

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Search and commands"
      shouldFilter={false}
      value={selected}
      onValueChange={setSelected}
      loop
      overlayClassName="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
      contentClassName="fixed top-[10vh] left-1/2 z-50 w-[calc(100vw-1.5rem)] max-w-2xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-pop"
    >
      <div className="flex items-center gap-3 border-b border-border px-4">
        <Search className="size-5 shrink-0 text-faint" />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Search tasks, notes, bookmarks, links, folders, tags… or type a command"
          className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-faint"
        />
        {searching && <span className="size-3 animate-pulse rounded-full bg-accent/50" aria-hidden />}
        <Kbd>Esc</Kbd>
      </div>
      <Command.List className="max-h-[60vh] overflow-y-auto p-2">
        {q && !searching && hits.length === 0 && matchingCommands.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted">Nothing matches “{query.trim()}”.</p>
        )}

        {hits.length > 0 && (
          <Command.Group heading="Results" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-faint">
            {hits.map((h) => (
              <Command.Item key={`${h.kind}-${h.id}`} value={`hit-${h.kind}-${h.id}`} onSelect={() => go(h.href)} className={itemClass}>
                <KindIcon kind={h.kind} />
                <div className="min-w-0 flex-1">
                  <div className={h.done ? "truncate text-faint line-through" : "truncate"}>
                    <Highlight text={h.title} tokens={tokens} />
                  </div>
                  <div className="truncate text-xs text-muted">{h.subtitle}</div>
                </div>
                <KindBadge kind={h.kind} />
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {q && (
          <Command.Group heading="Do" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-faint">
            <Command.Item value="do-search-all" onSelect={() => go(`/search?q=${encodeURIComponent(query.trim())}`)} className={itemClass}>
              <Search className="size-4 text-muted" />
              <span className="flex-1">See all results for “{query.trim()}”</span>
              <ArrowRight className="size-4 text-faint" />
            </Command.Item>
            <Command.Item value="do-capture" onSelect={() => void capture()} className={itemClass}>
              <Inbox className="size-4 text-muted" />
              <span className="flex-1 truncate">Capture “{query.trim()}” to Inbox</span>
            </Command.Item>
            <Command.Item value="do-task" onSelect={() => void quickCreate("TASK")} className={itemClass}>
              <CheckSquare className="size-4 text-muted" />
              <span className="flex-1 truncate">Create task “{query.trim()}”</span>
            </Command.Item>
            <Command.Item value="do-note" onSelect={() => void quickCreate("NOTE")} className={itemClass}>
              <StickyNote className="size-4 text-muted" />
              <span className="flex-1 truncate">Create note “{query.trim()}”</span>
            </Command.Item>
          </Command.Group>
        )}

        {matchingCommands.length > 0 && (
          <Command.Group heading="Commands" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-faint">
            {matchingCommands.map((c) => (
              <Command.Item key={c.id} value={`cmd-${c.id}`} onSelect={c.run} className={itemClass}>
                <c.icon className="size-4 text-muted" />
                <span className="flex-1">{c.label}</span>
                {c.shortcut && <Kbd>{c.shortcut}</Kbd>}
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
      <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-xs text-faint">
        <span>
          <Kbd>↑</Kbd> <Kbd>↓</Kbd> navigate
        </span>
        <span>
          <Kbd>↵</Kbd> open
        </span>
        <span className="ml-auto">Tip: quote “exact phrases”</span>
      </div>
    </Command.Dialog>
  );
}
