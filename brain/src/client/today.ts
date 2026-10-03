"use client";

import { useEffect, useState } from "react";
import { localToday } from "@/lib/dates";

/** The browser's local date, kept current across midnight. */
export function useToday(): string {
  const [today, setToday] = useState(() => localToday());
  useEffect(() => {
    const id = setInterval(() => setToday(localToday()), 60_000);
    return () => clearInterval(id);
  }, []);
  return today;
}
