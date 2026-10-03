"use client";

import { Bell, Bookmark, CheckSquare, Folder, Link2, StickyNote, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, mutate } from "@/client/api";
import { useToast } from "@/client/toast";
import type { QuickAddDefaults, QuickAddKind } from "@/client/ui-state";
import { cn } from "@/lib/cn";
import { localToday } from "@/lib/dates";
import type { FolderDTO, ItemDetail, Priority, Recurrence } from "@/lib/types";
import { PRIORITIES, PRIORITY_LABEL, RECURRENCES, RECURRENCE_LABEL } from "@/lib/types";
import { FolderSelect } from "./folder-select";
import { SecretWarning } from "./secret-warning";
import { TagInput } from "./tag-input";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Input, Label, Select, Textarea } from "./ui/input";

const KINDS: { kind: QuickAddKind; label: string; icon: LucideIcon }[] = [
  { kind: "TASK", label: "Task", icon: CheckSquare },
  { kind: "NOTE", label: "Note", icon: StickyNote },
  { kind: "BOOKMARK", label: "Bookmark", icon: Bookmark },
  { kind: "LINK", label: "Link", icon: Link2 },
  { kind: "FOLDER", label: "Folder", icon: Folder },
  { kind: "REMINDER", label: "Reminder", icon: Bell },
];

interface Metadata {
  title: string | null;
  description: string | null;
  faviconUrl: string | null;
}

export function QuickAdd({
  open,
  onOpenChange,
  initialKind,
  defaults,
}: {
  // Remounted (via key) on every opening, so state starts from these props.
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialKind: QuickAddKind;
  defaults: QuickAddDefaults;
}) {
  const router = useRouter();
  const toast = useToast();
  const [kind, setKind] = useState<QuickAddKind>(initialKind);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [credentialUrl, setCredentialUrl] = useState("");
  const [dueDate, setDueDate] = useState(defaults.dueDate ?? "");
  const [dueTime, setDueTime] = useState("");
  const [priority, setPriority] = useState<Priority>("NORMAL");
  const [recurrence, setRecurrence] = useState<Recurrence>("NONE");
  const [remindAt, setRemindAt] = useState("");
  const [folderId, setFolderId] = useState<string | null>(defaults.folderId ?? null);
  const [tags, setTags] = useState<string[]>(defaults.tags ?? []);
  const [meta, setMeta] = useState<Metadata | null>(null);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const titleTouched = useRef(false);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => (kind === "BOOKMARK" || kind === "LINK" ? urlRef : titleRef).current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open, kind]);

  const isWeb = kind === "BOOKMARK" || kind === "LINK";

  async function lookup(value: string = url) {
    if (!value.trim()) return;
    setFetching(true);
    try {
      const m = await api<Metadata & { url: string }>(`/api/metadata?url=${encodeURIComponent(value.trim())}`);
      setUrl(m.url);
      setMeta(m);
      if (!titleTouched.current && m.title) setTitle(m.title);
      if (!body && m.description) setBody(m.description);
    } catch {
      // Not fatal: the user can type a title.
    } finally {
      setFetching(false);
    }
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (saving) return;
    setError(null);
    setSaving(true);
    try {
      if (kind === "FOLDER") {
        if (!title.trim()) throw new Error("Name the folder.");
        const folder = await mutate<FolderDTO>("/api/folders", { method: "POST", body: { name: title, parentId: folderId } });
        onOpenChange(false);
        toast.show(`Created folder “${folder.name}”`, { action: { label: "Open", onClick: () => router.push(`/folders/${folder.id}`) } });
        return;
      }
      if (kind === "REMINDER" && !remindAt) throw new Error("Choose when to be reminded.");
      const type = kind === "REMINDER" ? "TASK" : kind;
      const reminderDate = remindAt ? new Date(remindAt) : null;
      const payload: Record<string, unknown> = { type, title, folderId, tags };
      if (type === "TASK") {
        Object.assign(payload, {
          description: body,
          priority,
          recurrence,
          dueDate: kind === "REMINDER" && reminderDate ? localToday(reminderDate) : dueDate || null,
          dueTime: kind === "REMINDER" ? remindAt.slice(11, 16) : dueTime || null,
          parentId: defaults.parentId ?? null,
          remindAt: reminderDate ? reminderDate.toISOString() : null,
        });
      } else if (type === "NOTE") {
        payload.text = body;
      } else {
        Object.assign(payload, {
          url,
          description: body,
          credentialUrl: credentialUrl || null,
          faviconUrl: meta?.faviconUrl ?? null,
          siteTitle: meta?.title ?? null,
        });
      }
      const item = await mutate<ItemDetail>("/api/items", { method: "POST", body: payload });
      onOpenChange(false);
      if (type === "NOTE") {
        router.push(`/items/${item.id}`);
      } else {
        toast.show(`Saved “${item.title}”`, {
          tone: "success",
          action: { label: "Open", onClick: () => router.push(`/items/${item.id}`) },
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Quick add" className="max-w-xl">
      <form
        onSubmit={submit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
        }}
        className="flex flex-col gap-4"
      >
        <div role="tablist" aria-label="What to add" className="grid grid-cols-3 gap-1 rounded-lg bg-surface-2 p-1 sm:grid-cols-6">
          {KINDS.map(({ kind: k, label, icon: Icon }) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm",
                kind === k ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-text",
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>

        {isWeb && (
          <div>
            <Label htmlFor="qa-url">URL</Label>
            <div className="flex gap-2">
              <Input
                id="qa-url"
                ref={urlRef}
                inputMode="url"
                placeholder="https://…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onBlur={() => void lookup()}
                onPaste={(e) => {
                  const input = e.currentTarget;
                  setTimeout(() => void lookup(input.value), 0);
                }}
              />
              <Button type="button" variant="secondary" onClick={() => void lookup()} disabled={fetching || !url.trim()}>
                {fetching ? "Fetching…" : "Fetch title"}
              </Button>
            </div>
          </div>
        )}

        <div>
          <Label htmlFor="qa-title">{kind === "FOLDER" ? "Folder name" : kind === "REMINDER" ? "Remind me to…" : "Title"}</Label>
          <Input
            id="qa-title"
            ref={titleRef}
            value={title}
            onChange={(e) => {
              titleTouched.current = true;
              setTitle(e.target.value);
            }}
            placeholder={
              kind === "TASK"
                ? "Submit Oklahoma waiver"
                : kind === "NOTE"
                  ? "Untitled note"
                  : kind === "FOLDER"
                    ? "Licensing"
                    : kind === "REMINDER"
                      ? "Call the licensing board"
                      : "Defaults to the page title"
            }
          />
        </div>

        {kind === "REMINDER" && (
          <div>
            <Label htmlFor="qa-remind">When</Label>
            <Input id="qa-remind" type="datetime-local" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} />
            <p className="mt-1 text-xs text-muted">Creates a task with an alert. Alerts appear while Brain is open in a tab.</p>
          </div>
        )}

        {kind === "TASK" && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="qa-due">Due date</Label>
              <Input id="qa-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="qa-time">Time</Label>
              <Input id="qa-time" type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Label htmlFor="qa-priority">Priority</Label>
              <Select id="qa-priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="col-span-2 sm:col-span-3">
              <Label htmlFor="qa-repeat">Repeat</Label>
              <Select id="qa-repeat" value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)}>
                {RECURRENCES.map((r) => (
                  <option key={r} value={r}>
                    {RECURRENCE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        )}

        {kind !== "FOLDER" && kind !== "REMINDER" && (
          <div>
            <Label htmlFor="qa-body">{kind === "NOTE" ? "Note" : "Description"}</Label>
            <Textarea
              id="qa-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={kind === "NOTE" ? "Start writing — you can format it after saving." : "Optional"}
              className={kind === "NOTE" ? "min-h-32" : "min-h-20"}
            />
            <SecretWarning text={body} />
          </div>
        )}

        {kind === "LINK" && (
          <div>
            <Label htmlFor="qa-cred">Password manager link (optional)</Label>
            <Input
              id="qa-cred"
              placeholder="https://start.1password.com/open/i?… or bitwarden://…"
              value={credentialUrl}
              onChange={(e) => setCredentialUrl(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted">A link to the login in your password manager — never the password itself.</p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="qa-folder">{kind === "FOLDER" ? "Inside" : "Folder"}</Label>
            <FolderSelect id="qa-folder" value={folderId} onChange={setFolderId} emptyLabel={kind === "FOLDER" ? "Top level" : "No folder"} />
          </div>
          {kind !== "FOLDER" && (
            <div>
              <Label htmlFor="qa-tags">Tags</Label>
              <TagInput id="qa-tags" value={tags} onChange={setTags} />
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <span className="hidden text-xs text-faint sm:block">⌘/Ctrl + Enter to save</span>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? "Saving…" : kind === "NOTE" ? "Create & open" : "Save"}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
