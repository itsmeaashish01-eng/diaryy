import { ItemView } from "@/views/item-view";

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ItemView key={id} id={id} />;
}
