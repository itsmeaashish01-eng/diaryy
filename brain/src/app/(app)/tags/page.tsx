import type { Metadata } from "next";
import { TagsView } from "@/views/tag-views";

export const metadata: Metadata = { title: "Tags" };

export default function Page() {
  return <TagsView />;
}
