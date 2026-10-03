"use client";

import { Bookmark, Folder, KeyRound, Link2, Star, StickyNote } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@/client/api";
import { useItemActions } from "@/client/item-actions";
import { useAppUi } from "@/client/ui-state";
import { FolderFilter, SortSelect, TagFilter, itemsUrl, type SortKey } from "@/components/filters";
import { GroupedByFolder, GroupedByTag } from "@/components/grouped";
import { ItemList, Section } from "@/components/item-row";
import { Favicon } from "@/components/item-visuals";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader, Segmented } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import type { FolderDTO, ItemSummary } from "@/lib/types";
import { isSafeHref } from "@/lib/url";

function Toolbar({
  sort,
  setSort,
  tag,
  setTag,
  folderId,
  setFolderId,
}: {
  sort: SortKey;
  setSort: (v: SortKey) => void;
  tag: string;
  setTag: (v: string) => void;
  folderId: string;
  setFolderId: (v: string) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <SortSelect value={sort} onChange={setSort} options={["updated", "created", "title"]} />
      <FolderFilter value={folderId} onChange={setFolderId} />
      <TagFilter value={tag} onChange={setTag} />
    </div>
  );
}

function Results({
  query,
  empty,
  render,
}: {
  query: ReturnType<typeof useQuery<ItemSummary[]>>;
  empty: React.ReactNode;
  render: (items: ItemSummary[]) => React.ReactNode;
}) {
  if (query.error) return <ErrorBlock message={query.error} onRetry={() => void query.reload()} />;
  if (!query.data) return <LoadingBlock />;
  if (query.data.length === 0) return <>{empty}</>;
  return <>{render(query.data)}</>;
}

// ---- Notes ----------------------------------------------------------------

export function NotesView() {
  const ui = useAppUi();
  const [sort, setSort] = useState<SortKey>("updated");
  const [tag, setTag] = useState("");
  const [folderId, setFolderId] = useState("");
  const query = useQuery<ItemSummary[]>(itemsUrl({ type: "NOTE", sort, tag, folderId }));
  return (
    <div>
      <PageHeader
        title="Notes"
        icon={StickyNote}
        actions={
          <Button variant="primary" onClick={() => ui.openQuickAdd("NOTE", { folderId: folderId || null })}>
            New note
          </Button>
        }
      />
      <Toolbar {...{ sort, setSort, tag, setTag, folderId, setFolderId }} />
      <Results
        query={query}
        empty={
          <EmptyState
            icon={StickyNote}
            title={tag || folderId ? "No notes match these filters" : "No notes yet"}
            action={<Button onClick={() => ui.openQuickAdd("NOTE")}>Write a note</Button>}
          >
            Notes support headings, lists, checklists, links and [[links to other items]].
          </EmptyState>
        }
        render={(items) => (
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map((n) => (
              <Link
                key={n.id}
                href={`/items/${n.id}`}
                className="group flex min-h-28 flex-col rounded-xl border border-border bg-surface p-4 transition-colors hover:border-faint"
              >
                <div className="flex items-start gap-2">
                  <span className="flex-1 font-medium">{n.title}</span>
                  {n.pinned && <span className="text-xs text-accent">Pinned</span>}
                  {n.favorite && <Star className="size-3.5 fill-amber-400 text-amber-400" />}
                </div>
                <p className="mt-1 line-clamp-3 flex-1 text-sm text-muted">{n.preview || "Empty note"}</p>
                <div className="mt-3 flex flex-wrap gap-x-3 text-xs text-faint">
                  <span>{new Date(n.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                  {n.folder && <span>{n.folder.path}</span>}
                  {n.tags.map((t) => (
                    <span key={t.id} className="text-accent/80">
                      #{t.name}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        )}
      />
    </div>
  );
}

// ---- Bookmarks ------------------------------------------------------------

type BookmarkView = "all" | "favorites" | "recent" | "category" | "tag";

export function BookmarksView() {
  const ui = useAppUi();
  const [view, setView] = useState<BookmarkView>("all");
  const [sort, setSort] = useState<SortKey>("created");
  const [tag, setTag] = useState("");
  const [folderId, setFolderId] = useState("");
  const query = useQuery<ItemSummary[]>(
    itemsUrl({
      type: "BOOKMARK",
      sort: view === "recent" ? "created" : sort,
      favorite: view === "favorites" && "true",
      limit: view === "recent" ? "30" : undefined,
      tag,
      folderId,
    }),
  );
  return (
    <div>
      <PageHeader
        title="Bookmarks"
        icon={Bookmark}
        subtitle="Things worth reading or coming back to."
        actions={
          <Button variant="primary" onClick={() => ui.openQuickAdd("BOOKMARK", { folderId: folderId || null })}>
            Add bookmark
          </Button>
        }
      />
      <div className="mb-4">
        <Segmented
          label="Bookmark views"
          value={view}
          onChange={setView}
          options={[
            { value: "all", label: "All" },
            { value: "favorites", label: "Favorites" },
            { value: "recent", label: "Recently added" },
            { value: "category", label: "By category" },
            { value: "tag", label: "By tag" },
          ]}
        />
      </div>
      {view !== "recent" && <Toolbar {...{ sort, setSort, tag, setTag, folderId, setFolderId }} />}
      <Results
        query={query}
        empty={
          <EmptyState
            icon={Bookmark}
            title={view === "favorites" ? "No favorite bookmarks" : "No bookmarks yet"}
            action={<Button onClick={() => ui.openQuickAdd("BOOKMARK")}>Add a bookmark</Button>}
          >
            Paste a URL anywhere in the capture box and it’s saved as a bookmark, with its title and icon.
          </EmptyState>
        }
        render={(items) =>
          view === "category" ? (
            <GroupedByFolder items={items} />
          ) : view === "tag" ? (
            <GroupedByTag items={items} />
          ) : (
            <ItemList items={items} />
          )
        }
      />
    </div>
  );
}

// ---- Links (the vault) ----------------------------------------------------

function LinkTile({ item }: { item: ItemSummary }) {
  const actions = useItemActions();
  const b = item.bookmark!;
  return (
    <div className="group relative flex items-center gap-3 rounded-xl border border-border bg-surface p-3 transition-colors hover:border-faint">
      <Favicon src={b.faviconUrl} domain={b.domain} className="size-8 rounded-md text-sm" />
      <div className="min-w-0 flex-1">
        {isSafeHref(b.url) ? (
          <a href={b.url} target="_blank" rel="noopener noreferrer" className="block truncate font-medium after:absolute after:inset-0">
            {item.title}
          </a>
        ) : (
          <span className="block truncate font-medium">{item.title}</span>
        )}
        <span className="block truncate text-xs text-muted">{b.domain}</span>
      </div>
      <div className="relative z-10 flex items-center">
        {b.credentialUrl && isSafeHref(b.credentialUrl) && (
          <a
            href={b.credentialUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open the login in your password manager"
            aria-label="Open in password manager"
            className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-text"
          >
            <KeyRound className="size-4" />
          </a>
        )}
        <button
          aria-label={item.favorite ? "Unfavorite" : "Favorite"}
          onClick={() => void actions.toggleFavorite(item)}
          className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-text"
        >
          <Star className={cn("size-4", item.favorite && "fill-amber-400 text-amber-400")} />
        </button>
        <Link href={`/items/${item.id}`} aria-label="Details" className="rounded-md px-1.5 py-1 text-xs text-muted hover:bg-hover hover:text-text">
          Edit
        </Link>
      </div>
    </div>
  );
}

function LinkGrid({ items }: { items: ItemSummary[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((i) => (
        <LinkTile key={i.id} item={i} />
      ))}
    </div>
  );
}

export function LinksView() {
  const ui = useAppUi();
  const [view, setView] = useState<"all" | "favorites" | "category">("category");
  const [tag, setTag] = useState("");
  const query = useQuery<ItemSummary[]>(itemsUrl({ type: "LINK", sort: "title", favorite: view === "favorites" && "true", tag }));
  return (
    <div>
      <PageHeader
        title="Links"
        icon={Link2}
        subtitle="Portals and sites you use often — one click away. Logins stay in your password manager."
        actions={
          <Button variant="primary" onClick={() => ui.openQuickAdd("LINK")}>
            Add link
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          label="Link views"
          value={view}
          onChange={setView}
          options={[
            { value: "category", label: "By category" },
            { value: "all", label: "A–Z" },
            { value: "favorites", label: "Favorites" },
          ]}
        />
        <TagFilter value={tag} onChange={setTag} />
      </div>
      <Results
        query={query}
        empty={
          <EmptyState icon={Link2} title="Your link vault is empty" action={<Button onClick={() => ui.openQuickAdd("LINK")}>Add a link</Button>}>
            Save licensing portals, hospital logins, bank sites and the like. Add a link to the entry in your password
            manager — never the password itself.
          </EmptyState>
        }
        render={(items) => {
          if (view !== "category") return <LinkGrid items={items} />;
          const groups = new Map<string, ItemSummary[]>();
          for (const i of items) groups.set(i.folder?.path ?? "", [...(groups.get(i.folder?.path ?? "") ?? []), i]);
          return Array.from(groups.keys())
            .sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)))
            .map((k) => (
              <Section key={k || "none"} title={k || "No folder"} count={groups.get(k)!.length}>
                <LinkGrid items={groups.get(k)!} />
              </Section>
            ));
        }}
      />
    </div>
  );
}

// ---- Favorites ------------------------------------------------------------

export function FavoritesView() {
  const favorites = useQuery<ItemSummary[]>(itemsUrl({ favorite: "true", sort: "updated" }));
  const pinned = useQuery<ItemSummary[]>(itemsUrl({ pinned: "true", sort: "updated" }));
  const folders = useQuery<FolderDTO[]>("/api/folders");
  const starredFolders = (folders.data ?? []).filter((f) => f.favorite || f.pinned);
  const nothing =
    favorites.data?.length === 0 && pinned.data?.length === 0 && folders.data && starredFolders.length === 0;
  return (
    <div>
      <PageHeader title="Favorites" icon={Star} subtitle="Everything you starred or pinned." />
      {(favorites.error || pinned.error) && <ErrorBlock message={favorites.error ?? pinned.error ?? ""} />}
      {(!favorites.data || !pinned.data) && !favorites.error && <LoadingBlock />}
      {nothing && (
        <EmptyState icon={Star} title="No favorites yet">
          Use the star on any task, note, bookmark, link or folder to collect it here.
        </EmptyState>
      )}
      {starredFolders.length > 0 && (
        <Section title="Folders" count={starredFolders.length}>
          <div className="flex flex-wrap gap-2">
            {starredFolders.map((f) => (
              <Link
                key={f.id}
                href={`/folders/${f.id}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:border-faint"
              >
                <Folder className="size-4 text-faint" /> {f.name}
                {f.favorite && <Star className="size-3 fill-amber-400 text-amber-400" />}
              </Link>
            ))}
          </div>
        </Section>
      )}
      {pinned.data && pinned.data.length > 0 && (
        <Section title="Pinned" count={pinned.data.length}>
          <ItemList items={pinned.data} showType />
        </Section>
      )}
      {favorites.data && favorites.data.length > 0 && (
        <Section title="Favorites" count={favorites.data.length}>
          <ItemList items={favorites.data} showType />
        </Section>
      )}
    </div>
  );
}

