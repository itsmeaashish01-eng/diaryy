import { FolderView } from "@/views/folder-views";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FolderView key={id} id={id} />;
}
