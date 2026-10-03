"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/client/api";
import { useToast } from "@/client/toast";

interface DueReminder {
  id: string;
  remindAt: string;
  item: { id: string; title: string };
}

/**
 * Checks for due reminders every 30 s while the app is open and shows them
 * in the page and, if allowed, as a system notification.
 */
export function ReminderWatcher() {
  const toast = useToast();
  const router = useRouter();
  useEffect(() => {
    let stopped = false;
    const check = async () => {
      try {
        const due = await api<DueReminder[]>("/api/reminders");
        for (const r of due) {
          if (stopped) return;
          await api(`/api/reminders/${r.id}`, { method: "POST" });
          toast.show(`⏰ ${r.item.title}`, {
            duration: 15_000,
            action: { label: "Open", onClick: () => router.push(`/items/${r.item.id}`) },
          });
          if ("Notification" in window && Notification.permission === "granted") {
            const n = new Notification("Brain reminder", { body: r.item.title, tag: r.id });
            n.onclick = () => {
              window.focus();
              router.push(`/items/${r.item.id}`);
            };
          }
        }
      } catch {
        // Offline or signed out — try again on the next tick.
      }
    };
    void check();
    const id = setInterval(check, 30_000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [toast, router]);
  return null;
}
