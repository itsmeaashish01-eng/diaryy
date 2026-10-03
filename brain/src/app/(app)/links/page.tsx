import type { Metadata } from "next";
import { LinksView } from "@/views/collection-views";

export const metadata: Metadata = { title: "Links" };

export default function Page() {
  return <LinksView />;
}
