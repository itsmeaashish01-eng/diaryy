import { mergeAttributes, Node } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";
import { ITEM_LINK_NODE } from "@/lib/rich-text";
import type { SearchHit } from "@/lib/types";

/** What the [[ popup offers: an existing item, or "create a note called …". */
export interface LinkSuggestion {
  id: string;
  label: string;
  kind: SearchHit["kind"] | "CREATE";
  subtitle?: string;
}

export interface SuggestionRenderer {
  onStart: (props: SuggestionProps<LinkSuggestion, LinkSuggestion>) => void;
  onUpdate: (props: SuggestionProps<LinkSuggestion, LinkSuggestion>) => void;
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
  onExit: () => void;
}

export interface ItemLinkOptions {
  /** Looks up items for the popup. */
  search: (query: string) => Promise<LinkSuggestion[]>;
  /** Creates a note for "Create …" and returns its id. */
  create: (title: string) => Promise<string>;
  renderer: () => SuggestionRenderer;
}

/**
 * An inline link to another item, written by typing [[ and picking from the
 * popup. Stored as a node with the item's id, so renaming the target never
 * breaks the link; the server turns these into "Related items".
 */
export const ItemLink = Node.create<ItemLinkOptions>({
  name: ITEM_LINK_NODE,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return {
      search: async () => [],
      create: async () => {
        throw new Error("not configured");
      },
      renderer: () => ({ onStart: () => {}, onUpdate: () => {}, onKeyDown: () => false, onExit: () => {} }),
    };
  },

  addAttributes() {
    return {
      id: { default: null },
      label: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "a[data-item-link]",
        getAttrs: (el) => ({ id: (el as HTMLElement).getAttribute("data-id"), label: (el as HTMLElement).textContent ?? "" }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const id = String(node.attrs.id ?? "");
    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        "data-item-link": "",
        "data-id": id,
        href: `/items/${encodeURIComponent(id)}`,
        title: `Open “${node.attrs.label}”`,
      }),
      String(node.attrs.label ?? ""),
    ];
  },

  renderText({ node }) {
    return `[[${node.attrs.label}]]`;
  },

  addProseMirrorPlugins() {
    const { search, create, renderer } = this.options;
    return [
      Suggestion<LinkSuggestion, LinkSuggestion>({
        editor: this.editor,
        pluginKey: new PluginKey("itemLinkSuggestion"),
        char: "[[",
        allowSpaces: true,
        allowedPrefixes: null,
        items: async ({ query }) => {
          const q = query.replace(/\]+$/, "").trim();
          const hits = q ? await search(q) : await search("");
          const exact = hits.some((h) => h.label.toLowerCase() === q.toLowerCase());
          return q && !exact ? [...hits, { id: "__create__", label: q, kind: "CREATE" }] : hits;
        },
        command: ({ editor, range, props }) => {
          const insert = (id: string, label: string) =>
            editor
              .chain()
              .focus()
              .insertContentAt(range, [
                { type: ITEM_LINK_NODE, attrs: { id, label } },
                { type: "text", text: " " },
              ])
              .run();
          if (props.kind === "CREATE") {
            void create(props.label).then((id) => insert(id, props.label));
          } else {
            insert(props.id, props.label);
          }
        },
        render: renderer,
      }),
    ];
  },
});
