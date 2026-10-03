"use client";

import { X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface Toast {
  id: number;
  message: string;
  tone: "info" | "error" | "success";
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  show: (message: string, opts?: { tone?: Toast["tone"]; action?: Toast["action"]; duration?: number }) => void;
  error: (err: unknown) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const show = useCallback<ToastApi["show"]>(
    (message, opts = {}) => {
      const id = nextId++;
      setToasts((t) => [...t.slice(-3), { id, message, tone: opts.tone ?? "info", action: opts.action }]);
      setTimeout(() => dismiss(id), opts.duration ?? (opts.tone === "error" ? 7000 : 4000));
    },
    [dismiss],
  );
  const api = useMemo<ToastApi>(
    () => ({
      show,
      error: (err) => show(err instanceof Error ? err.message : "Something went wrong.", { tone: "error" }),
    }),
    [show],
  );
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:pr-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex max-w-md items-center gap-3 rounded-lg border px-4 py-2.5 text-sm shadow-pop",
              t.tone === "error"
                ? "border-danger/30 bg-danger-soft text-danger"
                : "border-border bg-surface text-text",
            )}
          >
            <span className="flex-1">{t.message}</span>
            {t.action && (
              <button
                className="font-medium text-accent hover:underline"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button aria-label="Dismiss" className="text-faint hover:text-text" onClick={() => dismiss(t.id)}>
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast outside ToastProvider");
  return ctx;
}
