import type { Metadata } from "next";
import { TasksView, type TaskView } from "@/views/tasks-view";

export const metadata: Metadata = { title: "Tasks" };

const VIEWS = ["today", "upcoming", "overdue", "all", "completed", "category"];

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  return <TasksView initialView={view && VIEWS.includes(view) ? (view as TaskView) : "all"} />;
}
