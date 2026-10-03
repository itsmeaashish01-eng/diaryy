"use client";

import Placeholder from "@tiptap/extension-placeholder";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import {
  Bold,
  Code,
  CodeSquare,
  ExternalLink,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
  Unlink,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, mutate } from "@/client/api";
import { cn } from "@/lib/cn";
import type { ItemDetail, ItemSummary, SearchHit } from "@/lib/types";
import { isSafeHref, normalizeUrl } from "@/lib/url";
import { KindIcon } from "../item-visuals";
import { ItemLink, type LinkSuggestion, type SuggestionRenderer } from "./item-link";

// ---- [[ popup ---------------------------------------------------------------

interface PopupState {
  items: LinkSuggestion[];
  selected: number;
  rect: DOMRect | null;
  command: (item: LinkSuggestion) => void;
}

function SuggestionPopup({ state, onHover }: { state: PopupState; onHover: (i: number) => void }) {
  if (!state.rect) return null;
  const top = Math.min(state.rect.bottom + 6, window.innerHeight - 280);
  const left = Math.min(state.rect.left, window.innerWidth - 330);
  return createPortal(
    <div
      role="listbox"
      aria-label="Link to an item"
      style={{ top, left }}
      className="fixed z-50 w-80 max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-pop"
    >
      {state.items.length === 0 && <p className="px-3 py-2 text-sm text-muted">Type to search your items…</p>}
      {state.items.map((item, i) => (
        <button
          key={`${item.kind}-${item.id}`}
          role="option"
          aria-selected={i === state.selected}
          onMouseEnter={() => onHover(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            state.command(item);
          }}
          className={cn("flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm", i === state.selected && "bg-hover")}
        >
          {item.kind === "CREATE" ? (
            <span className="text-accent">+ Create note “{item.label}”</span>
          ) : (
            <>
              <KindIcon kind={item.kind} />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.subtitle && <span className="shrink-0 text-xs text-faint">{item.subtitle}</span>}
            </>
          )}
        </button>
      ))}
      <p className="border-t border-border px-3 pt-1.5 pb-1 text-[11px] text-faint">↑↓ to choose · Enter to link · Esc to cancel</p>
    </div>,
    document.body,
  );
}

/** Bridges TipTap's suggestion callbacks to React state for the popup. */
function useSuggestionPopup() {
  const [state, setState] = useState<PopupState | null>(null);
  const ref = useRef<PopupState | null>(null);
  const update = (s: PopupState | null) => {
    ref.current = s;
    setState(s);
  };
  const renderer = useMemo<() => SuggestionRenderer>(
    () => () => ({
      onStart: (p: SuggestionProps<LinkSuggestion, LinkSuggestion>) =>
        update({ items: p.items, selected: 0, rect: p.clientRect?.() ?? null, command: p.command }),
      onUpdate: (p: SuggestionProps<LinkSuggestion, LinkSuggestion>) =>
        update({ items: p.items, selected: Math.min(ref.current?.selected ?? 0, Math.max(0, p.items.length - 1)), rect: p.clientRect?.() ?? null, command: p.command }),
      onKeyDown: ({ event }: SuggestionKeyDownProps) => {
        const s = ref.current;
        if (!s) return false;
        if (event.key === "ArrowDown") {
          update({ ...s, selected: (s.selected + 1) % Math.max(1, s.items.length) });
          return true;
        }
        if (event.key === "ArrowUp") {
          update({ ...s, selected: (s.selected - 1 + s.items.length) % Math.max(1, s.items.length) });
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          const item = s.items[s.selected];
          if (item) s.command(item);
          return Boolean(item);
        }
        if (event.key === "Escape") {
          update(null);
          return true;
        }
        return false;
      },
      onExit: () => update(null),
    }),
    [],
  );
  return { state, renderer, setSelected: (i: number) => ref.current && update({ ...ref.current, selected: i }) };
}

// ---- Toolbar ------------------------------------------------------------------

function ToolButton({
  icon: Icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-hover hover:text-text disabled:opacity-30",
        active && "bg-accent-soft text-accent",
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}

function Toolbar({ editor, onLink }: { editor: Editor; onLink: () => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      task: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      codeBlock: e.isActive("codeBlock"),
      link: e.isActive("link"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  if (!s) return null;
  const c = () => editor.chain().focus();
  const sep = <span className="mx-1 h-5 w-px shrink-0 bg-border" />;
  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="sticky top-14 z-20 -mx-2 mb-3 flex items-center gap-0.5 overflow-x-auto border-b border-border bg-bg/95 px-2 py-1.5 backdrop-blur"
    >
      <ToolButton icon={Heading1} label="Heading 1" active={s.h1} onClick={() => c().toggleHeading({ level: 1 }).run()} />
      <ToolButton icon={Heading2} label="Heading 2" active={s.h2} onClick={() => c().toggleHeading({ level: 2 }).run()} />
      <ToolButton icon={Heading3} label="Heading 3" active={s.h3} onClick={() => c().toggleHeading({ level: 3 }).run()} />
      {sep}
      <ToolButton icon={Bold} label="Bold (⌘B)" active={s.bold} onClick={() => c().toggleBold().run()} />
      <ToolButton icon={Italic} label="Italic (⌘I)" active={s.italic} onClick={() => c().toggleItalic().run()} />
      <ToolButton icon={Strikethrough} label="Strikethrough" active={s.strike} onClick={() => c().toggleStrike().run()} />
      <ToolButton icon={Code} label="Inline code" active={s.code} onClick={() => c().toggleCode().run()} />
      <ToolButton icon={LinkIcon} label="Link (⌘K in text)" active={s.link} onClick={onLink} />
      {sep}
      <ToolButton icon={List} label="Bullet list" active={s.bullet} onClick={() => c().toggleBulletList().run()} />
      <ToolButton icon={ListOrdered} label="Numbered list" active={s.ordered} onClick={() => c().toggleOrderedList().run()} />
      <ToolButton icon={ListChecks} label="Checklist" active={s.task} onClick={() => c().toggleTaskList().run()} />
      <ToolButton icon={Quote} label="Quote" active={s.quote} onClick={() => c().toggleBlockquote().run()} />
      <ToolButton icon={CodeSquare} label="Code block" active={s.codeBlock} onClick={() => c().toggleCodeBlock().run()} />
      <ToolButton icon={Minus} label="Divider" onClick={() => c().setHorizontalRule().run()} />
      {sep}
      <button
        type="button"
        title="Link to another item"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => c().insertContent("[[").run()}
        className="h-8 shrink-0 rounded-md px-2 font-mono text-xs text-muted hover:bg-hover hover:text-text"
      >
        [[ ]]
      </button>
      <span className="flex-1" />
      <ToolButton icon={Undo2} label="Undo" disabled={!s.canUndo} onClick={() => c().undo().run()} />
      <ToolButton icon={Redo2} label="Redo" disabled={!s.canRedo} onClick={() => c().redo().run()} />
    </div>
  );
}

/** Shows the link under the cursor with Open / Edit / Remove. */
function LinkBar({ editor, onEdit }: { editor: Editor; onEdit: () => void }) {
  const href = useEditorState({
    editor,
    selector: ({ editor: e }) => (e.isActive("link") ? String(e.getAttributes("link").href ?? "") : null),
  });
  if (!href) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm">
      <LinkIcon className="size-3.5 text-faint" />
      <span className="min-w-0 flex-1 truncate text-muted">{href}</span>
      {isSafeHref(href) && (
        <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
          <ExternalLink className="size-3.5" /> Open
        </a>
      )}
      <button onClick={onEdit} className="font-medium text-muted hover:text-text">
        Edit
      </button>
      <button
        onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}
        className="inline-flex items-center gap-1 font-medium text-muted hover:text-danger"
      >
        <Unlink className="size-3.5" /> Remove
      </button>
    </div>
  );
}

function LinkForm({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const existing = editor.isActive("link") ? String(editor.getAttributes("link").href ?? "") : "";
  const [value, setValue] = useState(existing);
  const [error, setError] = useState<string | null>(null);
  const apply = () => {
    if (!value.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      onDone();
      return;
    }
    const href = normalizeUrl(value, "any");
    if (!href) {
      setError("Enter a web address (https://…), mailto: or tel: link.");
      return;
    }
    const chain = editor.chain().focus().extendMarkRange("link");
    if (editor.state.selection.empty && !editor.isActive("link")) {
      chain.insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] }).run();
    } else {
      chain.setLink({ href }).run();
    }
    onDone();
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
      className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-accent bg-surface px-3 py-2"
    >
      <LinkIcon className="size-4 text-faint" />
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onDone()}
        placeholder="Paste or type a link"
        aria-label="Link address"
        className="min-w-48 flex-1 bg-transparent text-sm outline-none"
      />
      <button type="submit" className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-fg">
        Apply
      </button>
      <button type="button" onClick={onDone} className="text-xs text-muted hover:text-text">
        Cancel
      </button>
      {error && <p className="w-full text-xs text-danger">{error}</p>}
    </form>
  );
}

// ---- Editor -------------------------------------------------------------------

export function NoteEditor({
  itemId,
  initialContent,
  onChange,
}: {
  itemId: string;
  initialContent: string;
  /** Called with the document as JSON text after every change. */
  onChange: (content: string) => void;
}) {
  const router = useRouter();
  const popup = useSuggestionPopup();
  const [linkFormOpen, setLinkFormOpen] = useState(false);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          defaultProtocol: "https",
          protocols: ["mailto", "tel"],
          isAllowedUri: (url) => isSafeHref(url) || normalizeUrl(url, "any") !== null,
          HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
        },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: "Start writing… Type [[ to link another item." }),
      ItemLink.configure({
        search: async (q) => {
          if (!q) {
            const recent = await api<ItemSummary[]>("/api/items?sort=updated&limit=8");
            return recent.filter((r) => r.id !== itemId).map((r) => ({ id: r.id, label: r.title, kind: r.type }));
          }
          const hits = await api<SearchHit[]>(`/api/search?q=${encodeURIComponent(q)}&limit=8`);
          return hits
            .filter((h) => h.kind !== "FOLDER" && h.kind !== "TAG" && h.id !== itemId)
            .map((h) => ({ id: h.id, label: h.title, kind: h.kind, subtitle: h.subtitle.split(" · ")[0] }));
        },
        create: async (title) => (await mutate<ItemDetail>("/api/items", { method: "POST", body: { type: "NOTE", title } })).id,
        renderer: popup.renderer,
      }),
    ],
    content: (() => {
      try {
        return initialContent ? (JSON.parse(initialContent) as object) : "";
      } catch {
        return "";
      }
    })(),
    editorProps: {
      attributes: { class: "prose-note", "aria-label": "Note text" },
      handleClick: (_view, _pos, event) => {
        const target = event.target as HTMLElement;
        const itemLink = target.closest("a[data-item-link]");
        if (itemLink) {
          const id = itemLink.getAttribute("data-id");
          if (id) router.push(`/items/${encodeURIComponent(id)}`);
          return true;
        }
        const a = target.closest("a[href]");
        if (a && (event.metaKey || event.ctrlKey)) {
          const href = a.getAttribute("href");
          if (href && isSafeHref(href)) window.open(href, "_blank", "noopener,noreferrer");
          return true;
        }
        return false;
      },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
          // In the editor, ⌘K adds a link when text is selected.
          const { empty } = _view.state.selection;
          if (!empty) {
            event.preventDefault();
            event.stopPropagation();
            setLinkFormOpen(true);
            return true;
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => onChangeRef.current(JSON.stringify(e.getJSON())),
  });

  // ⌘K is also the global palette; stop it here only when the form opens.
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && !editor.state.selection.empty) e.stopPropagation();
    };
    dom.addEventListener("keydown", onKey);
    return () => dom.removeEventListener("keydown", onKey);
  }, [editor]);

  if (!editor) return <div className="prose-note text-faint">Loading editor…</div>;

  return (
    <div>
      <Toolbar editor={editor} onLink={() => setLinkFormOpen(true)} />
      {linkFormOpen ? <LinkForm editor={editor} onDone={() => setLinkFormOpen(false)} /> : <LinkBar editor={editor} onEdit={() => setLinkFormOpen(true)} />}
      <EditorContent editor={editor} />
      {popup.state && <SuggestionPopup state={popup.state} onHover={popup.setSelected} />}
    </div>
  );
}
