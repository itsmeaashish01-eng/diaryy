"use client";

import { Check, Inbox, Trash2 } from "lucide-react";
import { useState } from "react";
import { mutate, useQuery } from "@/client/api";
import { useItemActions } from "@/client/item-actions";
import { useToast } from "@/client/toast";
import { CaptureBox } from "@/components/capture-box";
import { FolderSelect } from "@/components/folder-select";
import { ItemRow } from "@/components/item-row";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader } from "@/components/ui/misc";
import type { ItemSummary, ItemType } from "@/lib/types";
import { ITEM_TYPES, TYPE_LABEL } from "@/lib/types";

/** Controls to file an inbox item: change its type, put it in a folder, mark it done. */
function Organize({ item }: { item: ItemSummary }) {
  const toast = useToast();
  const actions = useItemActions();
  const [needsUrl, setNeedsUrl] = useState<ItemType | null>(null);
  const [url, setUrl] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const patch = async (body: Record<string, unknown>, message?: string) => {
    try {
      await mutate(`/api/items/${item.id}`, { method: "PATCH", body });
      if (message) toast.show(message);
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <Select
        aria-label="Change type"
        value={item.type}
        className="h-8 w-auto text-xs"
        onChange={(e) => {
          const type = e.target.value as ItemType;
          const hasUrl = Boolean(item.bookmark?.url ?? item.task?.url);
          if ((type === "BOOKMARK" || type === "LINK") && !hasUrl) setNeedsUrl(type);
          else void patch({ type }, `Now a ${TYPE_LABEL[type].toLowerCase()}`);
        }}
      >
        {ITEM_TYPES.map((t) => (
          <option key={t} value={t}>
            {TYPE_LABEL[t]}
          </option>
        ))}
      </Select>
      <FolderSelect
        className="h-8 w-auto text-xs"
        value={item.folder?.id ?? null}
        onChange={(folderId) => void patch({ folderId, inbox: folderId ? false : item.inbox }, folderId ? "Filed" : undefined)}
        emptyLabel="Move to folder…"
      />
      <Button size="sm" variant="secondary" onClick={() => void patch({ inbox: false }, "Moved out of Inbox")}>
        <Check className="size-3.5" /> Done
      </Button>
      <Button size="sm" variant="ghost" aria-label="Delete" onClick={() => setConfirmDelete(true)}>
        <Trash2 className="size-3.5" />
      </Button>
      {needsUrl && (
        <form
          className="flex w-full gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void patch({ type: needsUrl, url }, `Now a ${TYPE_LABEL[needsUrl].toLowerCase()}`).then(() => setNeedsUrl(null));
          }}
        >
          <Input autoFocus className="h-8 text-xs" placeholder="URL for this bookmark" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button size="sm" type="submit" variant="primary">
            Convert
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setNeedsUrl(null)}>
            Cancel
          </Button>
        </form>
      )}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this item?"
        description={`“${item.title}” will be permanently deleted.`}
        onConfirm={() => void actions.remove(item)}
      />
    </div>
  );
}

export function InboxView() {
  const query = useQuery<ItemSummary[]>("/api/items?inbox=true&sort=created");
  return (
    <div>
      <PageHeader
        title="Inbox"
        icon={Inbox}
        subtitle="Capture now, organize later. Anything saved here stays until you file it or mark it done."
      />
      <div className="mb-8">
        <CaptureBox autoFocus />
      </div>
      {query.error && <ErrorBlock message={query.error} onRetry={() => void query.reload()} />}
      {!query.data && !query.error && <LoadingBlock />}
      {query.data?.length === 0 && (
        <EmptyState icon={Inbox} title="Inbox zero">
          Everything is filed. Press <strong>I</strong> anywhere to capture something new.
        </EmptyState>
      )}
      {query.data && query.data.length > 0 && (
        <div className="-mx-3 flex flex-col divide-y divide-border">
          {query.data.map((item) => (
            <ItemRow key={item.id} item={item} showType extra={<Organize item={item} />} />
          ))}
        </div>
      )}
    </div>
  );
}
