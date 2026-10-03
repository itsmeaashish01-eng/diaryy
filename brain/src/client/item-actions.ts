"use client";

import { useMemo } from "react";
import { mutate } from "./api";
import { useToast } from "./toast";
import { localToday } from "@/lib/dates";
import type { ItemDetail, ItemSummary } from "@/lib/types";

type Target = Pick<ItemSummary, "id" | "title" | "pinned" | "favorite" | "task">;

/** The one-click actions available on any item, with feedback and undo. */
export function useItemActions() {
  const toast = useToast();
  return useMemo(() => {
    const patch = (id: string, body: Record<string, unknown>) =>
      mutate<ItemDetail>(`/api/items/${id}`, { method: "PATCH", body });

    return {
      async toggleDone(item: Target) {
        const done = item.task?.status !== "DONE";
        try {
          const result = await mutate<ItemDetail>(`/api/items/${item.id}/complete`, {
            method: "POST",
            body: { done, today: localToday() },
          });
          if (done && item.task?.recurrence !== "NONE" && result.task?.dueDate) {
            toast.show(`Done — next due ${result.task.dueDate}`, { tone: "success" });
          } else if (done) {
            toast.show(`Completed “${item.title}”`, {
              tone: "success",
              action: {
                label: "Undo",
                onClick: () =>
                  void mutate(`/api/items/${item.id}/complete`, { method: "POST", body: { done: false } }).catch(toast.error),
              },
            });
          }
        } catch (e) {
          toast.error(e);
        }
      },
      async togglePin(item: Target) {
        try {
          await patch(item.id, { pinned: !item.pinned });
          toast.show(item.pinned ? "Unpinned" : "Pinned to Home");
        } catch (e) {
          toast.error(e);
        }
      },
      async toggleFavorite(item: Target) {
        try {
          await patch(item.id, { favorite: !item.favorite });
          toast.show(item.favorite ? "Removed from Favorites" : "Added to Favorites");
        } catch (e) {
          toast.error(e);
        }
      },
      async archive(item: Target, archived = true) {
        try {
          await patch(item.id, { archived });
          toast.show(archived ? `Archived “${item.title}”` : `Restored “${item.title}”`, {
            action: archived
              ? { label: "Undo", onClick: () => void patch(item.id, { archived: false }).catch(toast.error) }
              : undefined,
          });
        } catch (e) {
          toast.error(e);
        }
      },
      async remove(item: Target) {
        try {
          await mutate(`/api/items/${item.id}`, { method: "DELETE" });
          toast.show(`Deleted “${item.title}”`);
        } catch (e) {
          toast.error(e);
        }
      },
      patch,
    };
  }, [toast]);
}
