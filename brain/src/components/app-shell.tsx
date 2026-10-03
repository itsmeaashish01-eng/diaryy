"use client";

import * as RD from "@radix-ui/react-dialog";
import { Menu, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { watchSystemTheme } from "@/client/theme";
import { ToastProvider } from "@/client/toast";
import { AppUiContext, type AppUi, type QuickAddDefaults, type QuickAddKind } from "@/client/ui-state";
import { CommandPalette } from "./command-palette";
import { QuickAdd } from "./quick-add";
import { ReminderWatcher } from "./reminder-watcher";
import { ShortcutsHelp } from "./shortcuts-help";
import { Sidebar } from "./sidebar";
import { Kbd } from "./ui/misc";

const noopSubscribe = () => () => {};

/** True when a key press is meant for a text field, not for a shortcut. */
function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [quickAdd, setQuickAdd] = useState<{ open: boolean; kind: QuickAddKind; defaults: QuickAddDefaults; seq: number }>({
    open: false,
    kind: "TASK",
    defaults: {},
    seq: 0,
  });
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pendingG = useRef<number>(0);
  const isMac = useSyncExternalStore(
    noopSubscribe,
    () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent),
    () => true,
  );

  useEffect(() => watchSystemTheme(), []);

  const openQuickAdd = useCallback((kind: QuickAddKind = "TASK", defaults: QuickAddDefaults = {}) => {
    setPaletteOpen(false);
    setQuickAdd((s) => ({ open: true, kind, defaults, seq: s.seq + 1 }));
  }, []);
  const openPalette = useCallback((q = "") => {
    setPaletteQuery(q);
    setPaletteOpen(true);
  }, []);
  const openShortcuts = useCallback(() => setShortcutsOpen(true), []);

  const ui = useMemo<AppUi>(
    () => ({ openQuickAdd, openPalette, openShortcuts, openSidebar: () => setDrawerOpen(true) }),
    [openQuickAdd, openPalette, openShortcuts],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        setPaletteQuery("");
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e) || e.defaultPrevented) return;
      if (document.querySelector("[role=dialog]")) return;

      const key = e.key.toLowerCase();
      if (Date.now() - pendingG.current < 1200) {
        pendingG.current = 0;
        const dest: Record<string, string> = {
          h: "/",
          i: "/inbox",
          t: "/today",
          a: "/tasks",
          n: "/notes",
          b: "/bookmarks",
          l: "/links",
          f: "/favorites",
          s: "/settings",
        };
        if (dest[key]) {
          e.preventDefault();
          router.push(dest[key]);
        }
        return;
      }
      switch (e.key) {
        case "g":
          pendingG.current = Date.now();
          break;
        case "/":
          e.preventDefault();
          openPalette();
          break;
        case "q":
        case "c":
          e.preventDefault();
          openQuickAdd("TASK");
          break;
        case "t":
          e.preventDefault();
          openQuickAdd("TASK");
          break;
        case "n":
          e.preventDefault();
          openQuickAdd("NOTE");
          break;
        case "b":
          e.preventDefault();
          openQuickAdd("BOOKMARK");
          break;
        case "l":
          e.preventDefault();
          openQuickAdd("LINK");
          break;
        case "i":
          e.preventDefault();
          router.push("/inbox");
          break;
        case "?":
          e.preventDefault();
          setShortcutsOpen(true);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPalette, openQuickAdd, router]);

  return (
    <AppUiContext.Provider value={ui}>
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-border bg-surface/60 lg:block">
          <Sidebar />
        </aside>

        <RD.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
          <RD.Portal>
            <RD.Overlay className="fixed inset-0 z-40 bg-black/40 lg:hidden" />
            <RD.Content className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r border-border bg-surface shadow-pop outline-none lg:hidden">
              <RD.Title className="sr-only">Navigation</RD.Title>
              <RD.Description className="sr-only">Sections, folders and settings</RD.Description>
              <Sidebar onNavigate={() => setDrawerOpen(false)} />
            </RD.Content>
          </RD.Portal>
        </RD.Root>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur supports-[padding:env(safe-area-inset-top)]:pt-[env(safe-area-inset-top)]">
            <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4 md:px-8">
              <button
                aria-label="Open navigation"
                onClick={() => setDrawerOpen(true)}
                className="grid size-9 place-items-center rounded-md text-muted hover:bg-hover lg:hidden"
              >
                <Menu className="size-5" />
              </button>
              <button
                onClick={() => openPalette()}
                className="flex h-10 flex-1 items-center gap-3 rounded-lg border border-border bg-surface px-3 text-left text-sm text-faint shadow-sm transition-colors hover:border-faint"
              >
                <Search className="size-4 shrink-0" />
                <span className="flex-1 truncate">Search everything…</span>
                <span className="hidden items-center gap-1 sm:flex">
                  <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
                  <Kbd>K</Kbd>
                </span>
              </button>
              <button
                onClick={() => openQuickAdd()}
                className="hidden h-10 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-sm font-medium text-accent-fg hover:opacity-90 sm:flex"
                title="Quick add (Q)"
              >
                <Plus className="size-4" /> New
              </button>
            </div>
          </header>

          <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28 md:px-8 md:pt-8">{children}</main>
        </div>

        {/* Floating + for phones and tablets. */}
        <button
          onClick={() => openQuickAdd()}
          aria-label="Quick add"
          className="fixed right-5 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-30 grid size-14 place-items-center rounded-full bg-accent text-accent-fg shadow-pop hover:opacity-90 sm:hidden"
        >
          <Plus className="size-6" />
        </button>
      </div>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        initialQuery={paletteQuery}
        onQuickAdd={openQuickAdd}
        onShortcuts={openShortcuts}
      />
      <QuickAdd
        key={quickAdd.seq}
        open={quickAdd.open}
        onOpenChange={(open) => setQuickAdd((s) => ({ ...s, open }))}
        initialKind={quickAdd.kind}
        defaults={quickAdd.defaults}
      />
      <ShortcutsHelp open={shortcutsOpen} onOpenChange={setShortcutsOpen} isMac={isMac} />
      <ReminderWatcher />
    </AppUiContext.Provider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AppShell>{children}</AppShell>
    </ToastProvider>
  );
}
