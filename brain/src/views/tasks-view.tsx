"use client";

import { CalendarDays, CheckSquare, PartyPopper } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { mutate, useQuery } from "@/client/api";
import { useToast } from "@/client/toast";
import { useToday } from "@/client/today";
import { useAppUi } from "@/client/ui-state";
import { FolderFilter, SortSelect, TagFilter, itemsUrl, type SortKey } from "@/components/filters";
import { GroupedByFolder } from "@/components/grouped";
import { ItemList, Section } from "@/components/item-row";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader, Segmented } from "@/components/ui/misc";
import type { Counts, ItemSummary, Priority, TaskStatus } from "@/lib/types";
import { PRIORITIES, PRIORITY_LABEL, STATUS_LABEL, TASK_STATUSES } from "@/lib/types";

export type TaskView = "today" | "upcoming" | "overdue" | "all" | "completed" | "category";

const VIEWS: { value: TaskView; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "overdue", label: "Overdue" },
  { value: "all", label: "All tasks" },
  { value: "completed", label: "Completed" },
  { value: "category", label: "By category" },
];

function InlineAdd({ dueDate }: { dueDate: string | null }) {
  const [title, setTitle] = useState("");
  const toast = useToast();
  return (
    <form
      className="mb-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        try {
          await mutate("/api/items", { method: "POST", body: { type: "TASK", title, dueDate } });
          setTitle("");
        } catch (err) {
          toast.error(err);
        }
      }}
    >
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={dueDate ? "Add a task for today — press Enter" : "Add a task — press Enter"}
        aria-label="New task title"
        className="h-10"
      />
    </form>
  );
}

export function TasksView({ initialView = "today", todayOnly = false }: { initialView?: TaskView; todayOnly?: boolean }) {
  const today = useToday();
  const router = useRouter();
  const ui = useAppUi();
  const [view, setView] = useState<TaskView>(todayOnly ? "today" : initialView);
  const [sort, setSort] = useState<SortKey>("due");
  const [tag, setTag] = useState("");
  const [folderId, setFolderId] = useState("");
  const [priority, setPriority] = useState<Priority | "">("");
  const [status, setStatus] = useState<TaskStatus | "">("");
  const { data: counts } = useQuery<Counts>(`/api/counts?today=${today}`);

  const apiView = view === "category" || view === "all" ? "open" : view;
  const filters = { tag, folderId, priority, status: view === "completed" ? "" : status, sort, today };
  const main = useQuery<ItemSummary[]>(itemsUrl({ type: "TASK", view: apiView, ...filters }));
  const overdue = useQuery<ItemSummary[]>(view === "today" ? itemsUrl({ type: "TASK", view: "overdue", ...filters }) : null);

  const changeView = (v: TaskView) => {
    setView(v);
    if (!todayOnly) router.replace(`/tasks?view=${v}`, { scroll: false });
  };

  const loading = main.loading || (view === "today" && overdue.loading);
  const items = main.data ?? [];
  const overdueItems = view === "today" ? (overdue.data ?? []) : [];

  return (
    <div>
      <PageHeader
        title={todayOnly ? "Today" : "Tasks"}
        icon={todayOnly ? CalendarDays : CheckSquare}
        subtitle={todayOnly ? new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : undefined}
        actions={
          <Button variant="primary" onClick={() => ui.openQuickAdd("TASK", { dueDate: view === "today" ? today : null })}>
            New task
          </Button>
        }
      />

      {!todayOnly && (
        <div className="mb-4">
          <Segmented
            label="Task views"
            value={view}
            onChange={changeView}
            options={VIEWS.map((v) => ({
              ...v,
              count: v.value === "today" ? counts?.today : v.value === "overdue" ? counts?.overdue : undefined,
            }))}
          />
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <SortSelect value={sort} onChange={setSort} options={["due", "priority", "updated", "created", "title"]} />
        <Select aria-label="Filter by priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority | "")} className="h-8 w-auto text-xs">
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </Select>
        {view !== "completed" && (
          <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus | "")} className="h-8 w-auto text-xs">
            <option value="">Any open status</option>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        )}
        <FolderFilter value={folderId} onChange={setFolderId} />
        <TagFilter value={tag} onChange={setTag} />
      </div>

      {(view === "today" || view === "all") && <InlineAdd dueDate={view === "today" ? today : null} />}

      {main.error && <ErrorBlock message={main.error} onRetry={() => void main.reload()} />}
      {loading && !main.data && <LoadingBlock />}

      {main.data && (
        <>
          {overdueItems.length > 0 && (
            <Section title="Overdue" count={overdueItems.length}>
              <ItemList items={overdueItems} />
            </Section>
          )}
          {items.length === 0 && overdueItems.length === 0 ? (
            <EmptyState
              icon={view === "today" ? PartyPopper : CheckSquare}
              title={
                view === "today"
                  ? "Nothing due today"
                  : view === "overdue"
                    ? "Nothing overdue"
                    : view === "completed"
                      ? "No completed tasks yet"
                      : "No tasks here"
              }
            >
              {view === "today" ? "Enjoy the free time, or add something above." : "Tasks you add will show up here."}
            </EmptyState>
          ) : view === "category" ? (
            <GroupedByFolder items={items} />
          ) : view === "today" ? (
            items.length > 0 && (
              <Section title="Today" count={items.length}>
                <ItemList items={items} />
              </Section>
            )
          ) : (
            <ItemList items={items} />
          )}
        </>
      )}
    </div>
  );
}
