"use client";

import { ChevronRight, Folder, FolderOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@/client/api";
import { cn } from "@/lib/cn";
import type { FolderDTO } from "@/lib/types";

export function childrenOf(folders: FolderDTO[], parentId: string | null): FolderDTO[] {
  return folders.filter((f) => f.parentId === parentId).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

/** Folders as [folder, depth] in tree order — for selects and outlines. */
export function flattenFolders(folders: FolderDTO[]): { folder: FolderDTO; depth: number }[] {
  const out: { folder: FolderDTO; depth: number }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const f of childrenOf(folders, parentId)) {
      out.push({ folder: f, depth });
      if (depth < 20) walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

function Node({ folder, all, depth, onNavigate }: { folder: FolderDTO; all: FolderDTO[]; depth: number; onNavigate?: () => void }) {
  const pathname = usePathname();
  const kids = childrenOf(all, folder.id);
  const active = pathname === `/folders/${folder.id}`;
  const [open, setOpen] = useState(false);
  return (
    <li>
      <div
        className={cn(
          "group flex items-center rounded-md text-sm",
          active ? "bg-hover font-medium text-text" : "text-muted hover:bg-hover hover:text-text",
        )}
        style={{ paddingLeft: depth * 12 }}
      >
        <button
          aria-label={open ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={cn("grid size-6 place-items-center text-faint hover:text-text", kids.length === 0 && "invisible")}
        >
          <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        </button>
        <Link href={`/folders/${folder.id}`} onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-2 py-1 pr-2">
          {open ? <FolderOpen className="size-4 shrink-0" /> : <Folder className="size-4 shrink-0" />}
          <span className="truncate">{folder.name}</span>
          {folder.itemCount > 0 && <span className="ml-auto text-xs text-faint">{folder.itemCount}</span>}
        </Link>
      </div>
      {open && kids.length > 0 && (
        <ul>
          {kids.map((k) => (
            <Node key={k.id} folder={k} all={all} depth={depth + 1} onNavigate={onNavigate} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function SidebarFolderTree({ onNavigate }: { onNavigate?: () => void }) {
  const { data } = useQuery<FolderDTO[]>("/api/folders");
  if (!data || data.length === 0) return null;
  return (
    <ul className="mt-0.5">
      {childrenOf(data, null).map((f) => (
        <Node key={f.id} folder={f} all={data} depth={0} onNavigate={onNavigate} />
      ))}
    </ul>
  );
}
