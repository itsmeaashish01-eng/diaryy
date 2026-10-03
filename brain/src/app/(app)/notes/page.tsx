import type { Metadata } from "next";
import { NotesView } from "@/views/collection-views";

export const metadata: Metadata = { title: "Notes" };

export default function Page() {
  return <NotesView />;
}
