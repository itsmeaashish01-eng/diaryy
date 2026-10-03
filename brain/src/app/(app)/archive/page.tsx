import type { Metadata } from "next";
import { ArchiveView } from "@/views/archive-view";

export const metadata: Metadata = { title: "Archive" };

export default function Page() {
  return <ArchiveView />;
}
