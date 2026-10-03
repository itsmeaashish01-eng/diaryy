import type { Metadata } from "next";
import { SearchView } from "@/views/search-view";

export const metadata: Metadata = { title: "Search" };

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return <SearchView initialQuery={q ?? ""} />;
}
