"use client";

import { useCallback, useEffect, useState } from "react";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";

/** JSON request to this app's API. Throws ApiError with a readable message. */
export async function api<T>(path: string, options: { method?: Method; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: options.method ?? "GET",
      headers: options.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Can't reach the app server. Is it still running?", 0);
  }
  if (res.status === 401 && typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.assign(new URL(`/login?next=${encodeURIComponent(window.location.pathname)}`, window.location.origin).toString());
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : `Request failed (${res.status}).`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

// ---- A small query cache ----------------------------------------------------
// Each GET path is fetched once and shared by every component that asks for
// it. After any change, `invalidate()` refetches whatever is on screen — the
// data set is personal-sized, so "refresh what's visible" is simple and fast.

interface Entry {
  data?: unknown;
  error?: string;
  inflight?: Promise<void>;
  listeners: Set<() => void>;
}

const cache = new Map<string, Entry>();

function entry(key: string): Entry {
  let e = cache.get(key);
  if (!e) {
    e = { listeners: new Set() };
    cache.set(key, e);
  }
  return e;
}

function load(key: string): Promise<void> {
  const e = entry(key);
  if (e.inflight) return e.inflight;
  e.inflight = api<unknown>(key)
    .then((data) => {
      e.data = data;
      e.error = undefined;
    })
    .catch((err: unknown) => {
      e.error = err instanceof Error ? err.message : "Could not load.";
    })
    .finally(() => {
      e.inflight = undefined;
      e.listeners.forEach((l) => l());
    });
  return e.inflight;
}

/** Refetches every query on screen (optionally only keys starting with `prefix`). */
export function invalidate(prefix = ""): Promise<void> {
  const jobs: Promise<void>[] = [];
  for (const [key, e] of cache) {
    if (!key.startsWith(prefix)) continue;
    if (e.listeners.size > 0) jobs.push(load(key));
    else cache.delete(key);
  }
  return Promise.all(jobs).then(() => undefined);
}

export interface Query<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
}

export function useQuery<T>(key: string | null): Query<T> {
  const [, force] = useState(0);
  useEffect(() => {
    if (!key) return;
    const e = entry(key);
    const listener = () => force((n) => n + 1);
    e.listeners.add(listener);
    if (e.data === undefined && !e.inflight) void load(key);
    return () => {
      e.listeners.delete(listener);
    };
  }, [key]);
  const reload = useCallback(() => (key ? load(key) : Promise.resolve()), [key]);
  const e = key ? cache.get(key) : undefined;
  return {
    data: e?.data as T | undefined,
    error: e?.error ?? null,
    loading: Boolean(key) && e?.data === undefined && !e?.error,
    reload,
  };
}

/** Runs a change, then refreshes everything on screen. */
export async function mutate<T>(path: string, options: { method: Method; body?: unknown }): Promise<T> {
  const result = await api<T>(path, options);
  void invalidate();
  return result;
}
