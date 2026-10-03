"use client";

import { useQuery } from "@/client/api";
import type { FolderDTO } from "@/lib/types";
import { Select } from "./ui/input";
import { flattenFolders } from "./folder-tree";

export function FolderSelect({
  value,
  onChange,
  id,
  excludeId,
  emptyLabel = "No folder",
  className,
}: {
  className?: string;
  value: string | null;
  onChange: (folderId: string | null) => void;
  id?: string;
  /** Hide this folder and everything inside it (for "move folder"). */
  excludeId?: string;
  emptyLabel?: string;
}) {
  const { data } = useQuery<FolderDTO[]>("/api/folders");
  const rows = flattenFolders(data ?? []);
  const hidden = new Set<string>();
  if (excludeId) {
    hidden.add(excludeId);
    for (const { folder } of rows) if (folder.parentId && hidden.has(folder.parentId)) hidden.add(folder.id);
  }
  return (
    <Select id={id} className={className} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{emptyLabel}</option>
      {rows
        .filter(({ folder }) => !hidden.has(folder.id))
        .map(({ folder, depth }) => (
          <option key={folder.id} value={folder.id}>
            {`${"   ".repeat(depth)}${depth ? "└ " : ""}${folder.name}`}
          </option>
        ))}
    </Select>
  );
}
