"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Folder,
  FolderInput,
  FolderPlus,
  Pencil,
  Pin,
  Plus,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { mutate, useQuery } from "@/client/api";
import { useToast } from "@/client/toast";
import { useAppUi } from "@/client/ui-state";
import { FolderSelect } from "@/components/folder-select";
import { childrenOf } from "@/components/folder-tree";
import { ItemList, Section } from "@/components/item-row";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader, Segmented } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import type { FolderDTO, ItemSummary, ItemType } from "@/lib/types";

function useFolderActions() {
  const toast = useToast();
  return {
    async patch(id: string, body: Record<string, unknown>, message?: string) {
      try {
        await mutate(`/api/folders/${id}`, { method: "PATCH", body });
        if (message) toast.show(message);
        return true;
      } catch (e) {
        toast.error(e);
        return false;
      }
    },
    async move(id: string, direction: "up" | "down") {
      try {
        await mutate(`/api/folders/${id}/move`, { method: "POST", body: { direction } });
      } catch (e) {
        toast.error(e);
      }
    },
    async remove(id: string) {
      try {
        await mutate(`/api/folders/${id}`, { method: "DELETE" });
        toast.show("Folder deleted. Its contents moved up a level.");
        return true;
      } catch (e) {
        toast.error(e);
        return false;
      }
    },
  };
}

/** Rename / move dialog shared by the folder list and the folder page. */
function EditFolderDialog({ folder, open, onOpenChange }: { folder: FolderDTO; open: boolean; onOpenChange: (o: boolean) => void }) {
  const actions = useFolderActions();
  const [name, setName] = useState(folder.name);
  const [parentId, setParentId] = useState<string | null>(folder.parentId);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Edit folder">
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await actions.patch(folder.id, { name, parentId }, "Folder saved");
          if (ok) onOpenChange(false);
        }}
      >
        <div>
          <Label htmlFor="f-name">Name</Label>
          <Input id="f-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="f-parent">Inside</Label>
          <FolderSelect id="f-parent" value={parentId} onChange={setParentId} excludeId={folder.id} emptyLabel="Top level" />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!name.trim()}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function FolderRow({ folder, all, depth, index, siblings }: { folder: FolderDTO; all: FolderDTO[]; depth: number; index: number; siblings: number }) {
  const actions = useFolderActions();
  const ui = useAppUi();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const kids = childrenOf(all, folder.id);
  return (
    <>
      <li className="group flex items-center gap-2 rounded-md py-1.5 pr-2 hover:bg-hover" style={{ paddingLeft: 8 + depth * 22 }}>
        <Folder className="size-4 shrink-0 text-faint" />
        <Link href={`/folders/${folder.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
          {folder.name}
        </Link>
        {folder.itemCount > 0 && <span className="text-xs text-faint">{folder.itemCount}</span>}
        <div className="flex items-center md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
          <button aria-label="Move up" title="Move up" disabled={index === 0} onClick={() => void actions.move(folder.id, "up")} className="rounded p-1 text-muted hover:text-text disabled:opacity-30">
            <ArrowUp className="size-3.5" />
          </button>
          <button aria-label="Move down" title="Move down" disabled={index === siblings - 1} onClick={() => void actions.move(folder.id, "down")} className="rounded p-1 text-muted hover:text-text disabled:opacity-30">
            <ArrowDown className="size-3.5" />
          </button>
          <button aria-label="Add subfolder" title="Add subfolder" onClick={() => ui.openQuickAdd("FOLDER", { folderId: folder.id })} className="rounded p-1 text-muted hover:text-text">
            <FolderPlus className="size-3.5" />
          </button>
          <button aria-label="Rename or move" title="Rename or move" onClick={() => setEditing(true)} className="rounded p-1 text-muted hover:text-text">
            <Pencil className="size-3.5" />
          </button>
          <button aria-label={folder.pinned ? "Unpin" : "Pin"} title={folder.pinned ? "Unpin" : "Pin to Home"} onClick={() => void actions.patch(folder.id, { pinned: !folder.pinned })} className="rounded p-1 text-muted hover:text-text">
            <Pin className={cn("size-3.5", folder.pinned && "fill-current text-accent")} />
          </button>
          <button aria-label={folder.favorite ? "Unfavorite" : "Favorite"} title="Favorite" onClick={() => void actions.patch(folder.id, { favorite: !folder.favorite })} className="rounded p-1 text-muted hover:text-text">
            <Star className={cn("size-3.5", folder.favorite && "fill-amber-400 text-amber-400")} />
          </button>
          <button aria-label="Delete folder" title="Delete" onClick={() => setDeleting(true)} className="rounded p-1 text-muted hover:text-danger">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </li>
      {kids.map((k, i) => (
        <FolderRow key={k.id} folder={k} all={all} depth={depth + 1} index={i} siblings={kids.length} />
      ))}
      {editing && <EditFolderDialog folder={folder} open={editing} onOpenChange={setEditing} />}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete “${folder.name}”?`}
        description="Nothing inside is deleted: its items and subfolders move up one level."
        onConfirm={() => void actions.remove(folder.id)}
      />
    </>
  );
}

export function FoldersView() {
  const ui = useAppUi();
  const toast = useToast();
  const { data, error, reload } = useQuery<FolderDTO[]>("/api/folders");
  const roots = data ? childrenOf(data, null) : [];
  return (
    <div>
      <PageHeader
        title="Folders"
        icon={Folder}
        subtitle="Organize anything into nested categories. Rename, reorder and nest freely."
        actions={
          <Button variant="primary" onClick={() => ui.openQuickAdd("FOLDER")}>
            <Plus className="size-4" /> New folder
          </Button>
        }
      />
      {error && <ErrorBlock message={error} onRetry={() => void reload()} />}
      {!data && !error && <LoadingBlock />}
      {data?.length === 0 && (
        <EmptyState
          icon={Folder}
          title="No folders yet"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={() => ui.openQuickAdd("FOLDER")}>
                Create a folder
              </Button>
              <Button
                onClick={async () => {
                  try {
                    const r = await mutate<{ created: number }>("/api/folders/starter", { method: "POST" });
                    toast.show(`Added ${r.created} starter folders`, { tone: "success" });
                  } catch (e) {
                    toast.error(e);
                  }
                }}
              >
                <Sparkles className="size-4" /> Add starter folders
              </Button>
            </div>
          }
        >
          Starter folders: Professional, Medicine, Personal and Technology, with subfolders. Edit or delete any of them.
        </EmptyState>
      )}
      {data && data.length > 0 && (
        <ul className="rounded-xl border border-border bg-surface p-2">
          {roots.map((f, i) => (
            <FolderRow key={f.id} folder={f} all={data} depth={0} index={i} siblings={roots.length} />
          ))}
        </ul>
      )}
    </div>
  );
}

type FolderTab = "all" | ItemType;

export function FolderView({ id }: { id: string }) {
  const router = useRouter();
  const ui = useAppUi();
  const actions = useFolderActions();
  const folders = useQuery<FolderDTO[]>("/api/folders");
  const [tab, setTab] = useState<FolderTab>("all");
  const items = useQuery<ItemSummary[]>(`/api/items?folderId=${id}&sort=updated${tab !== "all" ? `&type=${tab}` : ""}`);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (folders.error) return <ErrorBlock message={folders.error} />;
  if (!folders.data) return <LoadingBlock />;
  const folder = folders.data.find((f) => f.id === id);
  if (!folder) {
    return (
      <EmptyState icon={Folder} title="Folder not found" action={<Link href="/folders" className="text-accent hover:underline">All folders</Link>}>
        It may have been deleted.
      </EmptyState>
    );
  }
  const chain: FolderDTO[] = [];
  for (let f: FolderDTO | undefined = folder; f && chain.length < 20; f = folders.data.find((x) => x.id === f!.parentId)) chain.unshift(f);
  const subfolders = childrenOf(folders.data, id);

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1 text-sm text-muted">
        <Link href="/folders" className="hover:text-text">
          Folders
        </Link>
        {chain.slice(0, -1).map((f) => (
          <span key={f.id} className="flex items-center gap-1">
            <ChevronRight className="size-3.5" />
            <Link href={`/folders/${f.id}`} className="hover:text-text">
              {f.name}
            </Link>
          </span>
        ))}
      </nav>
      <PageHeader
        title={folder.name}
        icon={Folder}
        actions={
          <>
            <Button size="sm" variant="ghost" aria-label={folder.pinned ? "Unpin" : "Pin"} onClick={() => void actions.patch(folder.id, { pinned: !folder.pinned }, folder.pinned ? "Unpinned" : "Pinned to Home")}>
              <Pin className={cn("size-4", folder.pinned && "fill-current text-accent")} />
            </Button>
            <Button size="sm" variant="ghost" aria-label={folder.favorite ? "Unfavorite" : "Favorite"} onClick={() => void actions.patch(folder.id, { favorite: !folder.favorite })}>
              <Star className={cn("size-4", folder.favorite && "fill-amber-400 text-amber-400")} />
            </Button>
            <Button size="sm" onClick={() => setEditing(true)}>
              <FolderInput className="size-4" /> Rename / move
            </Button>
            <Button size="sm" variant="danger" onClick={() => setDeleting(true)}>
              <Trash2 className="size-4" /> Delete
            </Button>
            <Button size="sm" variant="primary" onClick={() => ui.openQuickAdd("TASK", { folderId: id })}>
              <Plus className="size-4" /> Add here
            </Button>
          </>
        }
      />

      {subfolders.length > 0 && (
        <Section title="Subfolders" count={subfolders.length}>
          <div className="flex flex-wrap gap-2">
            {subfolders.map((f) => (
              <Link key={f.id} href={`/folders/${f.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:border-faint">
                <Folder className="size-4 text-faint" /> {f.name}
                {f.itemCount > 0 && <span className="text-xs text-faint">{f.itemCount}</span>}
              </Link>
            ))}
          </div>
        </Section>
      )}

      <div className="mb-4">
        <Segmented
          label="Item type"
          value={tab}
          onChange={setTab}
          options={[
            { value: "all", label: "Everything" },
            { value: "TASK", label: "Tasks" },
            { value: "NOTE", label: "Notes" },
            { value: "BOOKMARK", label: "Bookmarks" },
            { value: "LINK", label: "Links" },
          ]}
        />
      </div>
      {items.error && <ErrorBlock message={items.error} />}
      {!items.data && !items.error && <LoadingBlock />}
      {items.data?.length === 0 && (
        <EmptyState icon={Folder} title="Nothing in this folder yet">
          Add something with the button above, or choose this folder on any item.
        </EmptyState>
      )}
      {items.data && items.data.length > 0 && <ItemList items={items.data} showType={tab === "all"} showFolder={false} />}

      {editing && <EditFolderDialog folder={folder} open={editing} onOpenChange={setEditing} />}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete “${folder.name}”?`}
        description="Nothing inside is deleted: its items and subfolders move up one level."
        onConfirm={async () => {
          if (await actions.remove(folder.id)) router.push(folder.parentId ? `/folders/${folder.parentId}` : "/folders");
        }}
      />
    </div>
  );
}
