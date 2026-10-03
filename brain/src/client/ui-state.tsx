"use client";

import { createContext, useContext } from "react";
import type { ItemType } from "@/lib/types";

export type QuickAddKind = ItemType | "FOLDER" | "REMINDER";

export interface QuickAddDefaults {
  folderId?: string | null;
  tags?: string[];
  dueDate?: string | null;
  parentId?: string | null;
}

export interface AppUi {
  openQuickAdd: (kind?: QuickAddKind, defaults?: QuickAddDefaults) => void;
  openPalette: (initialQuery?: string) => void;
  openShortcuts: () => void;
  openSidebar: () => void;
}

export const AppUiContext = createContext<AppUi | null>(null);

export function useAppUi(): AppUi {
  const ctx = useContext(AppUiContext);
  if (!ctx) throw new Error("useAppUi outside AppShell");
  return ctx;
}
