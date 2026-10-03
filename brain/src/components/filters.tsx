"use client";

import { useQuery } from "@/client/api";
import type { TagWithCount } from "@/lib/types";
import { FolderSelect } from "./folder-select";
import { Select } from "./ui/input";

export type SortKey = "updated" | "created" | "title" | "due" | "priority";

const SORT_LABEL: Record<SortKey, string> = {
  updated: "Recently updated",
  created: "Recently added",
  title: "Title A–Z",
  due: "Due date",
  priority: "Priority",
};

export function SortSelect({ value, onChange, options }: { value: SortKey; onChange: (v: SortKey) => void; options: SortKey[] }) {
  return (
    <Select aria-label="Sort" value={value} onChange={(e) => onChange(e.target.value as SortKey)} className="h-8 w-auto text-xs">
      {options.map((o) => (
        <option key={o} value={o}>
          Sort: {SORT_LABEL[o]}
        </option>
      ))}
    </Select>
  );
}

export function TagFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data } = useQuery<TagWithCount[]>("/api/tags");
  return (
    <Select aria-label="Filter by tag" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-auto text-xs">
      <option value="">All tags</option>
      {(data ?? []).map((t) => (
        <option key={t.id} value={t.name}>
          #{t.name}
        </option>
      ))}
    </Select>
  );
}

export function FolderFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <FolderSelect value={value || null} onChange={(v) => onChange(v ?? "")} emptyLabel="All folders" className="h-8 w-auto text-xs" />
  );
}

/** Builds an /api/items query string, skipping empty values. */
export function itemsUrl(params: Record<string, string | undefined | false>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  return `/api/items?${sp.toString()}`;
}
