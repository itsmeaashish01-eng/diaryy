"use client";

import { Hash, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { mutate, useQuery } from "@/client/api";
import { useToast } from "@/client/toast";
import { ItemList, Section } from "@/components/item-row";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader } from "@/components/ui/misc";
import type { ItemSummary, ItemType, TagWithCount } from "@/lib/types";
import { ITEM_TYPES, TYPE_LABEL } from "@/lib/types";
import { normalizeTag } from "@/lib/tags";

function RenameTag({ tag, open, onOpenChange, onRenamed }: { tag: TagWithCount; open: boolean; onOpenChange: (o: boolean) => void; onRenamed?: (name: string) => void }) {
  const toast = useToast();
  const [name, setName] = useState(tag.name);
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Rename #${tag.name}`} description="Renaming to an existing tag merges the two.">
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await mutate(`/api/tags/${tag.id}`, { method: "PATCH", body: { name } });
            onOpenChange(false);
            toast.show("Tag renamed");
            onRenamed?.(name);
          } catch (err) {
            toast.error(err);
          }
        }}
      >
        <div>
          <Label htmlFor="tag-name">Name</Label>
          <Input id="tag-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            Rename
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function useDeleteTag() {
  const toast = useToast();
  return async (tag: TagWithCount) => {
    try {
      await mutate(`/api/tags/${tag.id}`, { method: "DELETE" });
      toast.show(`Removed #${tag.name} from ${tag.count} item${tag.count === 1 ? "" : "s"}`);
      return true;
    } catch (e) {
      toast.error(e);
      return false;
    }
  };
}

export function TagsView() {
  const { data, error, reload } = useQuery<TagWithCount[]>("/api/tags");
  const [renaming, setRenaming] = useState<TagWithCount | null>(null);
  const [deleting, setDeleting] = useState<TagWithCount | null>(null);
  const remove = useDeleteTag();
  const max = Math.max(1, ...(data ?? []).map((t) => t.count));
  return (
    <div>
      <PageHeader title="Tags" icon={Hash} subtitle="Click a tag to see everything with it — tasks, notes, bookmarks and links together." />
      {error && <ErrorBlock message={error} onRetry={() => void reload()} />}
      {!data && !error && <LoadingBlock />}
      {data?.length === 0 && (
        <EmptyState icon={Hash} title="No tags yet">
          Add tags on any item, or type #tags when capturing to the Inbox.
        </EmptyState>
      )}
      {data && data.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((t) => (
            <li key={t.id} className="group flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
              <Link href={`/tags/${encodeURIComponent(t.name)}`} className="min-w-0 flex-1">
                <span className="block truncate font-medium text-accent">#{t.name}</span>
                <span className="mt-1 block h-1 rounded-full bg-surface-2">
                  <span className="block h-1 rounded-full bg-accent/50" style={{ width: `${(t.count / max) * 100}%` }} />
                </span>
              </Link>
              <span className="text-xs text-faint tabular-nums">{t.count}</span>
              <button aria-label={`Rename #${t.name}`} onClick={() => setRenaming(t)} className="rounded p-1 text-muted hover:text-text">
                <Pencil className="size-3.5" />
              </button>
              <button aria-label={`Delete #${t.name}`} onClick={() => setDeleting(t)} className="rounded p-1 text-muted hover:text-danger">
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {renaming && <RenameTag tag={renaming} open onOpenChange={(o) => !o && setRenaming(null)} />}
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          title={`Delete #${deleting.name}?`}
          description="The tag is removed from every item. The items themselves are kept."
          onConfirm={() => void remove(deleting)}
        />
      )}
    </div>
  );
}

export function TagView({ name }: { name: string }) {
  const router = useRouter();
  const tags = useQuery<TagWithCount[]>("/api/tags");
  const items = useQuery<ItemSummary[]>(`/api/items?tag=${encodeURIComponent(name)}&sort=updated`);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const remove = useDeleteTag();
  const tag = tags.data?.find((t) => t.name === name);
  const byType = new Map<ItemType, ItemSummary[]>();
  for (const i of items.data ?? []) byType.set(i.type, [...(byType.get(i.type) ?? []), i]);

  return (
    <div>
      <PageHeader
        title={`#${name}`}
        icon={Hash}
        subtitle={items.data ? `${items.data.length} item${items.data.length === 1 ? "" : "s"}` : undefined}
        actions={
          tag && (
            <>
              <Button size="sm" onClick={() => setRenaming(true)}>
                <Pencil className="size-4" /> Rename
              </Button>
              <Button size="sm" variant="danger" onClick={() => setDeleting(true)}>
                <Trash2 className="size-4" /> Delete tag
              </Button>
            </>
          )
        }
      />
      {items.error && <ErrorBlock message={items.error} />}
      {!items.data && !items.error && <LoadingBlock />}
      {items.data?.length === 0 && (
        <EmptyState icon={Hash} title="Nothing has this tag">
          <Link href="/tags" className="text-accent hover:underline">
            All tags
          </Link>
        </EmptyState>
      )}
      {ITEM_TYPES.filter((t) => byType.has(t)).map((t) => (
        <Section key={t} title={`${TYPE_LABEL[t]}s`} count={byType.get(t)!.length}>
          <ItemList items={byType.get(t)!} />
        </Section>
      ))}
      {tag && renaming && (
        <RenameTag
          tag={tag}
          open
          onOpenChange={setRenaming}
          onRenamed={(n) => router.replace(`/tags/${encodeURIComponent(normalizeTag(n))}`)}
        />
      )}
      {tag && (
        <ConfirmDialog
          open={deleting}
          onOpenChange={setDeleting}
          title={`Delete #${tag.name}?`}
          description="The tag is removed from every item. The items themselves are kept."
          onConfirm={async () => {
            if (await remove(tag)) router.push("/tags");
          }}
        />
      )}
    </div>
  );
}
