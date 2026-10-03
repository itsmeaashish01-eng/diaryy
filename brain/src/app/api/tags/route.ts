import { listTags } from "@/server/tags";
import { route } from "@/server/http";

export const GET = route(async () => listTags());
