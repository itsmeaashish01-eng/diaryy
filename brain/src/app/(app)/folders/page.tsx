import type { Metadata } from "next";
import { FoldersView } from "@/views/folder-views";

export const metadata: Metadata = { title: "Folders" };

export default function Page() {
  return <FoldersView />;
}
