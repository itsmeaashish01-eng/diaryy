"use client";

import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Bell,
  Check,
  CloudOff,
  ExternalLink,
  KeyRound,
  Link2,
  Loader2,
  Pin,
  Plus,
  RefreshCw,
  Star,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, mutate, useQuery } from "@/client/api";
import { useAutosave, type SaveStatus } from "@/client/autosave";
import { useItemActions } from "@/client/item-actions";
import { useToast } from "@/client/toast";
import { NoteEditor } from "@/components/editor/note-editor";
import { FolderSelect } from "@/components/folder-select";
import { ItemPicker } from "@/components/item-picker";
import { DueChip, TaskCheckbox } from "@/components/item-row";
import { Favicon, KindBadge, KindIcon } from "@/components/item-visuals";
import { LinkifiedText } from "@/components/linkified-text";
import { SecretWarning } from "@/components/secret-warning";
import { TagInput } from "@/components/tag-input";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { EmptyState, ErrorBlock, LoadingBlock } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { formatRelative, toDateTimeLocal } from "@/lib/dates";
import type { ItemDetail, ItemType, Priority, Recurrence, TaskStatus } from "@/lib/types";
import {
  ITEM_TYPES,
  PRIORITIES,
  PRIORITY_LABEL,
  RECURRENCES,
  RECURRENCE_LABEL,
  STATUS_LABEL,
  TASK_STATUSES,
  TYPE_LABEL,
} from "@/lib/types";
import { isSafeHref } from "@/lib/url";

const BACK: Record<ItemType, { href: string; label: string }> = {
  TASK: { href: "/tasks", label: "Tasks" },
  NOTE: { href: "/notes", label: "Notes" },
  BOOKMARK: { href: "/bookmarks", label: "Bookmarks" },
  LINK: { href: "/links", label: "Links" },
};

function SaveIndicator({ status, error }: { status: SaveStatus; error: string | null }) {
  if (status === "idle") return null;
  if (status === "error") {
    return (
      <span role="alert" className="inline-flex items-center gap-1 text-xs text-danger" title={error ?? undefined}>
        <CloudOff className="size-3.5" /> Not saved — {error}
      </span>
    );
  }
  return (
    <span aria-live="polite" className="inline-flex items-center gap-1 text-xs text-faint">
      {status === "saved" ? (
        <>
          <Check className="size-3.5" /> Saved
        </>
      ) : (
        <>
          <Loader2 className="size-3.5 animate-spin" /> Saving…
        </>
      )}
    </span>
  );
}

function Field({ label, htmlFor, children, className }: { label: string; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

/** Text that shows its links when not being edited; click to edit. */
function RichPlainField({
  id,
  value,
  onChange,
  placeholder,
  related,
  minRows = 4,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  related: ItemDetail["related"];
  minRows?: number;
}) {
  const [editing, setEditing] = useState(false);
  if (editing || !value.trim()) {
    return (
      <>
        <Textarea
          id={id}
          autoFocus={editing}
          value={value}
          rows={minRows}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setEditing(false)}
          placeholder={placeholder}
        />
        <SecretWarning text={value} />
      </>
    );
  }
  return (
    <div
      id={id}
      role="textbox"
      tabIndex={0}
      aria-label="Edit text"
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest("a")) setEditing(true);
      }}
      onKeyDown={(e) => e.key === "Enter" && setEditing(true)}
      className="min-h-24 cursor-text rounded-md border border-transparent px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap hover:border-border"
    >
      <LinkifiedText text={value} related={related} />
    </div>
  );
}

// ---- Related items ----------------------------------------------------------

function RelatedItems({ item }: { item: ItemDetail }) {
  const toast = useToast();
  const [picking, setPicking] = useState(false);
  return (
    <section className="mt-10">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">
          Related items <span className="ml-1 font-normal text-faint">{item.related.length}</span>
        </h2>
        <Button size="sm" variant="ghost" onClick={() => setPicking(true)}>
          <Link2 className="size-4" /> Link item
        </Button>
      </div>
      {item.related.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-4 text-sm text-muted">
          Link this to notes, tasks, bookmarks or links it belongs with
          {item.type === "NOTE" ? " — or type [[ in the note." : item.type === "TASK" ? " — or write [[Title]] in the description." : "."}
        </p>
      ) : (
        <ul className="-mx-2">
          {item.related.map((r) => (
            <li key={r.id} className="group flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-hover">
              <KindIcon kind={r.type} />
              <Link href={`/items/${r.id}`} className={cn("min-w-0 flex-1 truncate text-sm", r.done && "text-faint line-through")}>
                {r.title}
              </Link>
              <KindBadge kind={r.type} />
              {r.origin === "WIKILINK" ? (
                <span className="w-16 text-right text-xs text-faint" title="Linked with [[…]] in the text">
                  {r.direction === "outgoing" ? "in text" : "mentions"}
                </span>
              ) : (
                <button
                  aria-label={`Unlink ${r.title}`}
                  title="Unlink"
                  onClick={async () => {
                    try {
                      await mutate(`/api/items/${item.id}/relations/${r.id}`, { method: "DELETE" });
                    } catch (e) {
                      toast.error(e);
                    }
                  }}
                  className="w-16 text-right text-faint hover:text-danger"
                >
                  <X className="ml-auto size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <ItemPicker
        open={picking}
        onOpenChange={setPicking}
        excludeIds={[item.id, ...item.related.map((r) => r.id)]}
        onPick={async (hit) => {
          setPicking(false);
          try {
            await mutate(`/api/items/${item.id}/relations`, { method: "POST", body: { targetId: hit.id } });
            toast.show(`Linked “${hit.title}”`);
          } catch (e) {
            toast.error(e);
          }
        }}
      />
    </section>
  );
}

// ---- Subtasks -----------------------------------------------------------------

function Subtasks({ item }: { item: ItemDetail }) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  return (
    <section className="mt-8">
      <h2 className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">
        Subtasks
        {item.subtasks.length > 0 && (
          <span className="ml-2 font-normal text-faint">
            {item.subtasks.filter((s) => s.task?.status === "DONE").length}/{item.subtasks.length}
          </span>
        )}
      </h2>
      <ul className="-mx-2">
        {item.subtasks.map((s) => (
          <li key={s.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-hover">
            <TaskCheckbox item={s} />
            <Link href={`/items/${s.id}`} className={cn("min-w-0 flex-1 truncate text-sm", s.task?.status === "DONE" && "text-faint line-through")}>
              {s.title}
            </Link>
            {s.task?.dueDate && <DueChip date={s.task.dueDate} time={s.task.dueTime} done={s.task.status === "DONE"} />}
          </li>
        ))}
      </ul>
      <form
        className="mt-1 flex items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          try {
            await mutate("/api/items", { method: "POST", body: { type: "TASK", title, parentId: item.id, folderId: item.folder?.id ?? null } });
            setTitle("");
          } catch (err) {
            toast.error(err);
          }
        }}
      >
        <Plus className="size-4 text-faint" />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a subtask — press Enter"
          aria-label="New subtask"
          className="h-8 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
        />
      </form>
    </section>
  );
}

// ---- The page -------------------------------------------------------------------

function ItemEditor({ item }: { item: ItemDetail }) {
  const router = useRouter();
  const toast = useToast();
  const actions = useItemActions();
  const { save, flush, status, error } = useAutosave(item.id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Local copies of editable fields: typing never waits on the server, and
  // background refreshes never overwrite what is being typed.
  const [title, setTitle] = useState(item.title);
  const [folderId, setFolderId] = useState(item.folder?.id ?? null);
  const [tags, setTags] = useState(item.tags.map((t) => t.name));
  const [description, setDescription] = useState(item.task?.description ?? item.bookmark?.description ?? "");
  const [notes, setNotes] = useState(item.bookmark?.notes ?? "");
  const [url, setUrl] = useState(item.bookmark?.url ?? item.task?.url ?? "");
  const [credentialUrl, setCredentialUrl] = useState(item.bookmark?.credentialUrl ?? "");
  const [status_, setStatus] = useState<TaskStatus>(item.task?.status ?? "TODO");
  const [priority, setPriority] = useState<Priority>(item.task?.priority ?? "NORMAL");
  const [dueDate, setDueDate] = useState(item.task?.dueDate ?? "");
  const [dueTime, setDueTime] = useState(item.task?.dueTime ?? "");
  const [recurrence, setRecurrence] = useState<Recurrence>(item.task?.recurrence ?? "NONE");
  const pendingReminder = item.reminders.find((r) => !r.firedAt);
  const [remindAt, setRemindAt] = useState(pendingReminder ? toDateTimeLocal(pendingReminder.remindAt) : "");

  // Status and due date also change through the checkbox (and recurring
  // tasks move their date): follow the server when it changes them.
  const serverTask = `${item.task?.status}|${item.task?.dueDate}`;
  const [seenTask, setSeenTask] = useState(serverTask);
  if (serverTask !== seenTask) {
    setSeenTask(serverTask);
    if (item.task) {
      setStatus(item.task.status);
      setDueDate(item.task.dueDate ?? "");
    }
  }

  const titleRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [title]);
  useEffect(() => {
    if (item.title === "Untitled" || item.title === "Untitled task") titleRef.current?.select();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const type = item.type;
  const isWeb = type === "BOOKMARK" || type === "LINK";
  const back = item.parent ? { href: `/items/${item.parent.id}`, label: item.parent.title } : BACK[type];

  async function refreshMetadata() {
    setRefreshing(true);
    try {
      await flush();
      const m = await api<{ title: string | null; description: string | null; faviconUrl: string | null; url: string }>(
        `/api/metadata?url=${encodeURIComponent(url)}`,
      );
      const patch: Record<string, unknown> = { siteTitle: m.title, faviconUrl: m.faviconUrl };
      if (!description && m.description) {
        setDescription(m.description);
        patch.description = m.description;
      }
      save(patch, true);
      toast.show(m.title || m.faviconUrl ? "Updated from the website" : "The website did not provide a title or icon");
    } catch (e) {
      toast.error(e);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <article>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={back.href} className="inline-flex max-w-[50%] items-center gap-1 truncate text-sm text-muted hover:text-text">
          <ArrowLeft className="size-4 shrink-0" /> <span className="truncate">{back.label}</span>
        </Link>
        <KindBadge kind={type} />
        {item.inbox && <span className="rounded bg-warn-soft px-1.5 py-0.5 text-[11px] font-medium text-warn uppercase">Inbox</span>}
        {item.archivedAt && <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted uppercase">Archived</span>}
        <span className="ml-auto">
          <SaveIndicator status={status} error={error} />
        </span>
      </div>

      <div className="flex items-start gap-3">
        {item.task && <TaskCheckbox item={item} className="mt-2.5 size-5" />}
        {isWeb && <Favicon src={item.bookmark?.faviconUrl} domain={item.bookmark?.domain ?? ""} className="mt-2.5 size-6 text-xs" />}
        <textarea
          ref={titleRef}
          rows={1}
          value={title}
          aria-label="Title"
          onChange={(e) => {
            setTitle(e.target.value.replace(/\n/g, " "));
            save({ title: e.target.value.replace(/\n/g, " ") });
          }}
          onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
          placeholder="Title"
          className={cn(
            "flex-1 resize-none overflow-hidden bg-transparent text-2xl leading-tight font-semibold tracking-tight outline-none placeholder:text-faint md:text-3xl",
            item.task?.status === "DONE" && "text-faint line-through",
          )}
        />
      </div>

      <div className="mt-3 mb-6 flex flex-wrap items-center gap-1">
        <Button size="sm" variant="ghost" onClick={() => void actions.togglePin(item)} aria-pressed={item.pinned}>
          <Pin className={cn("size-4", item.pinned && "fill-current text-accent")} /> {item.pinned ? "Pinned" : "Pin"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void actions.toggleFavorite(item)} aria-pressed={item.favorite}>
          <Star className={cn("size-4", item.favorite && "fill-amber-400 text-amber-400")} /> {item.favorite ? "Favorited" : "Favorite"}
        </Button>
        {item.inbox && (
          <Button size="sm" variant="ghost" onClick={() => save({ inbox: false }, true)}>
            <Check className="size-4" /> Done organizing
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => void actions.archive(item, !item.archivedAt)}>
          {item.archivedAt ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
          {item.archivedAt ? "Restore" : "Archive"}
        </Button>
        <Button size="sm" variant="ghost" className="hover:text-danger" onClick={() => setConfirmDelete(true)}>
          <Trash2 className="size-4" /> Delete
        </Button>
        <Select
          aria-label="Convert to another type"
          value={type}
          className="ml-auto h-8 w-auto text-xs"
          onChange={async (e) => {
            const to = e.target.value as ItemType;
            if ((to === "BOOKMARK" || to === "LINK") && !url) {
              toast.show("Add a related URL first, then convert it to a bookmark or link.", { tone: "error" });
              return;
            }
            try {
              await flush();
              await mutate(`/api/items/${item.id}`, { method: "PATCH", body: { type: to } });
              toast.show(`Converted to ${TYPE_LABEL[to].toLowerCase()}`);
            } catch (err) {
              toast.error(err);
            }
          }}
        >
          {ITEM_TYPES.map((t) => (
            <option key={t} value={t}>
              {t === type ? TYPE_LABEL[t] : `Convert to ${TYPE_LABEL[t].toLowerCase()}`}
            </option>
          ))}
        </Select>
      </div>

      {/* Type-specific fields */}
      {item.task && (
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-3">
          <Field label="Status" htmlFor="f-status">
            <Select
              id="f-status"
              value={status_}
              onChange={(e) => {
                setStatus(e.target.value as TaskStatus);
                save({ status: e.target.value }, true);
              }}
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priority" htmlFor="f-priority">
            <Select
              id="f-priority"
              value={priority}
              onChange={(e) => {
                setPriority(e.target.value as Priority);
                save({ priority: e.target.value }, true);
              }}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Repeat" htmlFor="f-repeat" className="col-span-2 sm:col-span-1">
            <Select
              id="f-repeat"
              value={recurrence}
              onChange={(e) => {
                setRecurrence(e.target.value as Recurrence);
                save({ recurrence: e.target.value }, true);
              }}
            >
              {RECURRENCES.map((r) => (
                <option key={r} value={r}>
                  {RECURRENCE_LABEL[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Due date" htmlFor="f-due">
            <Input
              id="f-due"
              type="date"
              value={dueDate}
              onChange={(e) => {
                setDueDate(e.target.value);
                save({ dueDate: e.target.value || null }, true);
              }}
            />
          </Field>
          <Field label="Due time" htmlFor="f-time">
            <Input
              id="f-time"
              type="time"
              value={dueTime}
              onChange={(e) => {
                setDueTime(e.target.value);
                save({ dueTime: e.target.value || null });
              }}
            />
          </Field>
          <Field label="Related URL" htmlFor="f-url" className="col-span-2 sm:col-span-1">
            <div className="flex gap-1">
              <Input
                id="f-url"
                inputMode="url"
                placeholder="https://…"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  save({ url: e.target.value || null });
                }}
              />
              {isSafeHref(item.task.url) && (
                <a href={item.task.url!} target="_blank" rel="noopener noreferrer" aria-label="Open URL" className="grid size-9 shrink-0 place-items-center rounded-md border border-border text-muted hover:text-accent">
                  <ExternalLink className="size-4" />
                </a>
              )}
            </div>
          </Field>
          {item.task.lastCompletedAt && item.task.recurrence !== "NONE" && (
            <p className="col-span-full text-xs text-muted">Last completed {formatRelative(item.task.lastCompletedAt)}.</p>
          )}
        </div>
      )}

      {isWeb && (
        <div className="grid gap-3 rounded-xl border border-border bg-surface p-4">
          <Field label="URL" htmlFor="f-url">
            <div className="flex gap-1">
              <Input
                id="f-url"
                inputMode="url"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (e.target.value.trim()) save({ url: e.target.value });
                }}
              />
              {item.bookmark && isSafeHref(item.bookmark.url) && (
                <a
                  href={item.bookmark.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90"
                >
                  <ExternalLink className="size-4" /> Open
                </a>
              )}
              <Button variant="secondary" size="icon" className="size-9" aria-label="Fetch title and icon from the website" title="Fetch title and icon" onClick={() => void refreshMetadata()} disabled={refreshing}>
                <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
              </Button>
            </div>
          </Field>
          <Field label={type === "LINK" ? "Password manager link" : "Password manager link (optional)"} htmlFor="f-cred">
            <div className="flex gap-1">
              <Input
                id="f-cred"
                placeholder="https://start.1password.com/open/i?… or bitwarden://…"
                value={credentialUrl}
                onChange={(e) => {
                  setCredentialUrl(e.target.value);
                  save({ credentialUrl: e.target.value || null });
                }}
              />
              {item.bookmark?.credentialUrl && isSafeHref(item.bookmark.credentialUrl) && (
                <a
                  href={item.bookmark.credentialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-border px-3 text-sm hover:bg-hover"
                >
                  <KeyRound className="size-4" /> Open login
                </a>
              )}
            </div>
            <p className="mt-1 text-xs text-muted">Where the login lives — never the password itself.</p>
          </Field>
          <Field label="Description" htmlFor="f-desc">
            <Textarea
              id="f-desc"
              rows={2}
              className="min-h-16"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                save({ description: e.target.value });
              }}
            />
            <SecretWarning text={description} />
          </Field>
        </div>
      )}

      {/* Organization */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Folder" htmlFor="f-folder">
          <FolderSelect
            id="f-folder"
            value={folderId}
            onChange={(v) => {
              setFolderId(v);
              save({ folderId: v, ...(v && item.inbox ? { inbox: false } : {}) }, true);
            }}
          />
        </Field>
        <Field label="Tags" htmlFor="f-tags">
          <TagInput
            id="f-tags"
            value={tags}
            onChange={(t) => {
              setTags(t);
              save({ tags: t }, true);
            }}
          />
        </Field>
      </div>

      {/* Body */}
      {item.note && (
        <div className="mt-8">
          <NoteEditor itemId={item.id} initialContent={item.note.content} onChange={(content) => save({ content }, false)} />
        </div>
      )}
      {item.task && (
        <div className="mt-6">
          <Label htmlFor="f-desc">Description</Label>
          <RichPlainField
            id="f-desc"
            value={description}
            related={item.related}
            onChange={(v) => {
              setDescription(v);
              save({ description: v });
            }}
            placeholder="Notes, links, [[Linked item]]…"
          />
        </div>
      )}
      {isWeb && (
        <div className="mt-6">
          <Label htmlFor="f-notes">Notes</Label>
          <RichPlainField
            id="f-notes"
            value={notes}
            related={item.related}
            onChange={(v) => {
              setNotes(v);
              save({ notes: v });
            }}
            placeholder="Why you saved it, what to remember…"
          />
        </div>
      )}

      {item.task && !item.task.parentId && <Subtasks item={item} />}

      <RelatedItems item={item} />

      <section className="mt-10">
        <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted uppercase">
          <Bell className="size-3.5" /> Reminder
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="datetime-local"
            aria-label="Remind me at"
            value={remindAt}
            className="w-auto"
            onChange={(e) => {
              setRemindAt(e.target.value);
              save({ remindAt: e.target.value ? new Date(e.target.value).toISOString() : null }, true);
            }}
          />
          {remindAt && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setRemindAt("");
                save({ remindAt: null }, true);
              }}
            >
              Clear
            </Button>
          )}
          <span className="text-xs text-muted">Shown while Brain is open in a browser tab.</span>
        </div>
      </section>

      <footer className="mt-10 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-4 text-xs text-faint">
        <span>Created {new Date(item.createdAt).toLocaleString()}</span>
        <span>Updated {formatRelative(item.updatedAt)}</span>
        {item.task?.completedAt && <span>Completed {new Date(item.task.completedAt).toLocaleString()}</span>}
        {item.archivedAt && <span>Archived {new Date(item.archivedAt).toLocaleString()}</span>}
      </footer>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete permanently?"
        description={`“${item.title}”${item.subtasks.length ? " and its subtasks" : ""} will be deleted for good. Archive instead to keep it out of sight.`}
        onConfirm={async () => {
          await actions.remove(item);
          router.push(back.href);
        }}
      />
    </article>
  );
}

export function ItemView({ id }: { id: string }) {
  const { data, error, reload } = useQuery<ItemDetail>(`/api/items/${id}`);
  if (error) {
    return error.includes("not found") ? (
      <EmptyState icon={Trash2} title="This item does not exist" action={<Link href="/" className="text-accent hover:underline">Go Home</Link>}>
        It may have been deleted.
      </EmptyState>
    ) : (
      <ErrorBlock message={error} onRetry={() => void reload()} />
    );
  }
  if (!data) return <LoadingBlock />;
  // Remount when the type changes so the right fields initialise.
  return (
    <div className="mx-auto max-w-3xl">
      <ItemEditor key={`${data.id}-${data.type}`} item={data} />
    </div>
  );
}
