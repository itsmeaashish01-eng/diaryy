"use client";

import { Archive, Trash2 } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@/client/api";
import { useItemActions } from "@/client/item-actions";
import { ItemRow } from "@/components/item-row";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader } from "@/components/ui/misc";
import type { ItemSummary } from "@/lib/types";

export function ArchiveView() {
  const query = useQuery<ItemSummary[]>("/api/items?archived=true&sort=updated");
  const actions = useItemActions();
  const [deleting, setDeleting] = useState<ItemSummary | null>(null);
  return (
    <div>
      <PageHeader title="Archive" icon={Archive} subtitle="Archived items are hidden everywhere else. Restore them, or delete them for good." />
      {query.error && <ErrorBlock message={query.error} />}
      {!query.data && !query.error && <LoadingBlock />}
      {query.data?.length === 0 && (
        <EmptyState icon={Archive} title="Nothing archived">
          Archive things you are done with but might want later.
        </EmptyState>
      )}
      <div className="-mx-3 flex flex-col">
        {query.data?.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            showType
            extra={
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => void actions.archive(item, false)}>
                  Restore
                </Button>
                <Button size="sm" variant="danger" onClick={() => setDeleting(item)}>
                  <Trash2 className="size-3.5" /> Delete forever
                </Button>
              </div>
            }
          />
        ))}
      </div>
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          title="Delete permanently?"
          description={`“${deleting.title}” will be gone for good. Export a backup first if unsure.`}
          onConfirm={() => void actions.remove(deleting)}
        />
      )}
    </div>
  );
}
