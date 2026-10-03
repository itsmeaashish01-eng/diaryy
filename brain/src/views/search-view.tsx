"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@/client/api";
import { Highlight } from "@/components/highlight";
import { KindBadge, KindIcon } from "@/components/item-visuals";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorBlock, LoadingBlock, PageHeader, Segmented } from "@/components/ui/misc";
import { tokenize } from "@/lib/search";
import type { SearchHit, SearchHitKind } from "@/lib/types";

type Filter = "ALL" | SearchHitKind;

export function SearchView({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [archived, setArchived] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(q);
      router.replace(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : "/search", { scroll: false });
    }, 150);
    return () => clearTimeout(t);
  }, [q, router]);

  const query = useQuery<SearchHit[]>(
    debounced.trim() ? `/api/search?q=${encodeURIComponent(debounced.trim())}&limit=200${archived ? "&archived=true" : ""}` : null,
  );
  const hits = query.data ?? [];
  const tokens = tokenize(debounced);
  const count = (k: SearchHitKind) => hits.filter((h) => h.kind === k).length;
  const shown = filter === "ALL" ? hits : hits.filter((h) => h.kind === filter);

  return (
    <div>
      <PageHeader title="Search" icon={Search} />
      <Input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search titles, notes, descriptions, URLs, tags, folders…"
        className="mb-4 h-12 text-base"
        aria-label="Search"
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          label="Filter results"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "ALL", label: "All", count: hits.length },
            { value: "TASK", label: "Tasks", count: count("TASK") },
            { value: "NOTE", label: "Notes", count: count("NOTE") },
            { value: "BOOKMARK", label: "Bookmarks", count: count("BOOKMARK") },
            { value: "LINK", label: "Links", count: count("LINK") },
            { value: "FOLDER", label: "Folders", count: count("FOLDER") },
            { value: "TAG", label: "Tags", count: count("TAG") },
          ]}
        />
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="accent-[var(--accent)]" />
          Include archived
        </label>
      </div>
      {!debounced.trim() && (
        <EmptyState icon={Search} title="Search everything">
          Every word must match somewhere — title, text, URL, tag or folder. Put “exact phrases” in quotes.
        </EmptyState>
      )}
      {query.error && <ErrorBlock message={query.error} />}
      {query.loading && <LoadingBlock />}
      {query.data && shown.length === 0 && (
        <EmptyState icon={Search} title={`No results for “${debounced.trim()}”`}>
          Try fewer words, or include archived items.
        </EmptyState>
      )}
      <ul className="-mx-3 flex flex-col">
        {shown.map((h) => (
          <li key={`${h.kind}-${h.id}`}>
            <Link href={h.href} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-hover">
              <KindIcon kind={h.kind} />
              <div className="min-w-0 flex-1">
                <div className={h.done ? "truncate font-medium text-faint line-through" : "truncate font-medium"}>
                  <Highlight text={h.title} tokens={tokens} />
                </div>
                <div className="truncate text-xs text-muted">{h.subtitle}</div>
              </div>
              <KindBadge kind={h.kind} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
