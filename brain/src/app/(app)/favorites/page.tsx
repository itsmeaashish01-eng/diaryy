import type { Metadata } from "next";
import { FavoritesView } from "@/views/collection-views";

export const metadata: Metadata = { title: "Favorites" };

export default function Page() {
  return <FavoritesView />;
}
