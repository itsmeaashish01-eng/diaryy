"use client";

import { Dialog } from "./ui/dialog";
import { Kbd } from "./ui/misc";

export function ShortcutsHelp({ open, onOpenChange, isMac }: { open: boolean; onOpenChange: (o: boolean) => void; isMac: boolean }) {
  const mod = isMac ? "⌘" : "Ctrl";
  const rows: [string[], string][] = [
    [[mod, "K"], "Search & command palette"],
    [["/"], "Search"],
    [["Q"], "Quick add"],
    [["T"], "New task"],
    [["N"], "New note"],
    [["B"], "New bookmark"],
    [["L"], "New link"],
    [["I"], "Capture to Inbox"],
    [["G", "H"], "Go to Home"],
    [["G", "I"], "Go to Inbox"],
    [["G", "T"], "Go to Today"],
    [["G", "A"], "Go to all Tasks"],
    [["G", "N"], "Go to Notes"],
    [["G", "B"], "Go to Bookmarks"],
    [["G", "L"], "Go to Links"],
    [["G", "F"], "Go to Favorites"],
    [["G", "S"], "Go to Settings"],
    [[mod, "Enter"], "Save (in forms)"],
    [["[["], "Link another item (in notes)"],
    [["?"], "This help"],
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Keyboard shortcuts">
      <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {rows.map(([keys, label]) => (
          <li key={label} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted">{label}</span>
            <span className="flex gap-1">
              {keys.map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
