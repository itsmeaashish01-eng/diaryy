import { route } from "@/server/http";
import { authEnabled } from "@/lib/session";

export const GET = route(async () => ({ enabled: authEnabled() }));
