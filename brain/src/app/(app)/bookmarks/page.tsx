import type { Metadata } from "next";
import { BookmarksView } from "@/views/collection-views";

export const metadata: Metadata = { title: "Bookmarks" };

export default function Page() {
  return <BookmarksView />;
}
