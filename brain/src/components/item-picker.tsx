"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/client/api";
import { cn } from "@/lib/cn";
import type { SearchHit } from "@/lib/types";
import { KindBadge, KindIcon } from "./item-visuals";
import { Dialog } from "./ui/dialog";

/** Search-and-pick dialog for linking one item to another. */
export function ItemPicker({
  open,
  onOpenChange,
  excludeIds,
  onPick,
  title = "Link a related item",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  excludeIds: string[];
  onPick: (hit: SearchHit) => void;
  title?: string;
}) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const exclude = excludeIds.join(",");

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setQ("");
  }
  const hits = q.trim() ? found : [];

  useEffect(() => {
    if (!q.trim()) return;
    let cancelled = false;
    const t = setTimeout(() => {
      api<SearchHit[]>(`/api/search?q=${encodeURIComponent(q)}&limit=15`)
        .then((r) => {
          if (cancelled) return;
          setFound(r.filter((h) => h.kind !== "FOLDER" && h.kind !== "TAG" && !exclude.split(",").includes(h.id)));
          setActive(0);
        })
        .catch(() => !cancelled && setFound([]));
    }, 100);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, exclude]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description="Search for a task, note, bookmark or link.">
      <div className="flex items-center gap-2 rounded-md border border-border px-3 focus-within:border-accent">
        <Search className="size-4 text-faint" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, hits.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && hits[active]) {
              e.preventDefault();
              onPick(hits[active]);
            }
          }}
          placeholder="Type to search…"
          aria-label="Search items to link"
          className="h-10 flex-1 bg-transparent text-sm outline-none"
        />
      </div>
      <ul role="listbox" className="mt-2 max-h-80 overflow-y-auto">
        {q.trim() && hits.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted">No matching items.</li>}
        {hits.map((h, i) => (
          <li key={h.id} role="option" aria-selected={i === active}>
            <button
              onMouseEnter={() => setActive(i)}
              onClick={() => onPick(h)}
              className={cn("flex w-full items-center gap-3 rounded-md px-3 py-2 text-left", i === active && "bg-hover")}
            >
              <KindIcon kind={h.kind} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{h.title}</span>
                <span className="block truncate text-xs text-muted">{h.subtitle}</span>
              </span>
              <KindBadge kind={h.kind} />
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
