import { TagView } from "@/views/tag-views";

export default async function Page({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const tag = decodeURIComponent(name);
  return <TagView key={tag} name={tag} />;
}
