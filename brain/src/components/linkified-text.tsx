import Link from "next/link";
import type { ReactNode } from "react";
import type { RelatedItem } from "@/lib/types";
import { isSafeHref } from "@/lib/url";

const TOKEN = /(\bhttps?:\/\/[^\s<>"'`]+[^\s<>"'`.,;:!?)\]}])|\[\[([^[\]\n]{1,200})\]\]/gi;

/**
 * Plain text with URLs and [[Item]] references made clickable. Built from
 * React elements only — the text is never interpreted as HTML.
 */
export function LinkifiedText({ text, related = [] }: { text: string; related?: RelatedItem[] }) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const start = m.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    if (m[1]) {
      out.push(
        isSafeHref(m[1]) ? (
          <a key={start} href={m[1]} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2 break-all">
            {m[1]}
          </a>
        ) : (
          m[1]
        ),
      );
    } else if (m[2]) {
      const title = m[2].trim();
      const target = related.find((r) => r.title.toLowerCase() === title.toLowerCase());
      out.push(
        <Link
          key={start}
          href={target ? `/items/${target.id}` : `/search?q=${encodeURIComponent(title)}`}
          className="rounded bg-accent-soft px-1 font-medium text-accent"
          title={target ? undefined : "No item with this title yet — click to search"}
        >
          {title}
        </Link>,
      );
    }
    last = start + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}
