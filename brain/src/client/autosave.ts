"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, invalidate } from "./api";

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

/**
 * Collects edits to one item and saves them shortly after typing stops.
 * Pending edits are flushed when the page is left, so nothing typed is lost.
 */
export function useAutosave(itemId: string, delay = 600) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<Record<string, unknown>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());

  const send = useCallback(
    (body: Record<string, unknown>, keepalive = false) =>
      fetch(`/api/items/${itemId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        keepalive,
      }),
    [itemId],
  );

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const body = pending.current;
    if (Object.keys(body).length === 0) return chain.current;
    pending.current = {};
    setStatus("saving");
    // Saves run one after another so an older save never lands last.
    chain.current = chain.current.then(async () => {
      try {
        const res = await send(body);
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new ApiError(data?.error ?? `Save failed (${res.status})`, res.status);
        }
        setError(null);
        setStatus(Object.keys(pending.current).length ? "pending" : "saved");
        void invalidate();
      } catch (e) {
        // Keep the edits so the next change (or a retry) sends them again.
        pending.current = { ...body, ...pending.current };
        setError(e instanceof Error ? e.message : "Save failed");
        setStatus("error");
      }
    });
    return chain.current;
  }, [send]);

  const save = useCallback(
    (patch: Record<string, unknown>, immediate = false) => {
      pending.current = { ...pending.current, ...patch };
      setStatus("pending");
      if (timer.current) clearTimeout(timer.current);
      if (immediate) void flush();
      else timer.current = setTimeout(() => void flush(), delay);
    },
    [delay, flush],
  );

  useEffect(() => {
    const onLeave = () => {
      if (Object.keys(pending.current).length) {
        void send(pending.current, true);
        pending.current = {};
      }
    };
    window.addEventListener("pagehide", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      onLeave(); // navigating within the app
    };
  }, [send]);

  return { save, flush, status, error };
}
