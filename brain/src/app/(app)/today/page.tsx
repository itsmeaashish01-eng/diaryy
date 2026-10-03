import type { Metadata } from "next";
import { TasksView } from "@/views/tasks-view";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return <TasksView todayOnly />;
}
