import { dueReminders } from "@/server/dashboard";
import { route } from "@/server/http";

export const GET = route(async () => dueReminders());
