import { createStarterFolders } from "@/server/folders";
import { route } from "@/server/http";

export const POST = route(async () => ({ created: await createStarterFolders() }));
