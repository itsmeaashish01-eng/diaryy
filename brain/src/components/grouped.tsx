import type { ItemSummary } from "@/lib/types";
import { ItemList, Section } from "./item-row";

/** Items grouped by folder path ("By category" views). */
export function GroupedByFolder({ items, showType }: { items: ItemSummary[]; showType?: boolean }) {
  const groups = new Map<string, ItemSummary[]>();
  for (const item of items) {
    const key = item.folder?.path ?? "";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const keys = Array.from(groups.keys()).sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));
  return (
    <>
      {keys.map((k) => (
        <Section key={k || "none"} title={k || "No folder"} count={groups.get(k)!.length}>
          <ItemList items={groups.get(k)!} showType={showType} showFolder={false} />
        </Section>
      ))}
    </>
  );
}

/** Items grouped by tag; an item with two tags appears under both. */
export function GroupedByTag({ items }: { items: ItemSummary[] }) {
  const groups = new Map<string, ItemSummary[]>();
  for (const item of items) {
    const names = item.tags.length ? item.tags.map((t) => t.name) : [""];
    for (const n of names) groups.set(n, [...(groups.get(n) ?? []), item]);
  }
  const keys = Array.from(groups.keys()).sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));
  return (
    <>
      {keys.map((k) => (
        <Section key={k || "none"} title={k ? `#${k}` : "Untagged"} count={groups.get(k)!.length}>
          <ItemList items={groups.get(k)!} />
        </Section>
      ))}
    </>
  );
}
