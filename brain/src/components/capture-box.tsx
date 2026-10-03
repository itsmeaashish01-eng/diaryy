"use client";

import { Inbox } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { mutate } from "@/client/api";
import { useToast } from "@/client/toast";
import { parseCapture, type CaptureMode } from "@/lib/capture";
import { cn } from "@/lib/cn";
import type { ItemDetail } from "@/lib/types";
import { TYPE_LABEL } from "@/lib/types";
import { SecretWarning } from "./secret-warning";

const MODES: { value: CaptureMode; label: string }[] = [
  { value: "AUTO", label: "Auto" },
  { value: "TASK", label: "Task" },
  { value: "NOTE", label: "Note" },
  { value: "BOOKMARK", label: "Bookmark" },
  { value: "LINK", label: "Link" },
];

/**
 * The fastest way in: paste or type anything, press Enter, sort it out later.
 * A URL becomes a bookmark, "todo …" a task, anything else a note; #tags work.
 */
export function CaptureBox({ autoFocus = false, compact = false }: { autoFocus?: boolean; compact?: boolean }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<CaptureMode>("AUTO");
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [text]);

  const preview = text.trim() ? parseCapture(text, mode) : null;

  async function save() {
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      const item = await mutate<ItemDetail>("/api/capture", { method: "POST", body: { text, mode } });
      setText("");
      toast.show(`Captured ${TYPE_LABEL[item.type].toLowerCase()} “${item.title}”`, { tone: "success" });
      ref.current?.focus();
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-3 shadow-sm focus-within:border-accent focus-within:ring-3 focus-within:ring-[var(--ring)]">
      <div className="flex items-start gap-3">
        <Inbox className="mt-1.5 size-4 shrink-0 text-faint" />
        <textarea
          ref={ref}
          rows={1}
          value={text}
          aria-label="Capture to Inbox"
          placeholder={compact ? "Capture to Inbox…" : "Capture anything — paste a URL, jot a task (“todo …”), an idea, a note. Enter to save."}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void save();
            }
          }}
          className="max-h-60 min-h-8 flex-1 resize-none bg-transparent py-1 text-[15px] outline-none placeholder:text-faint"
        />
        <button
          onClick={() => void save()}
          disabled={!text.trim() || saving}
          className="h-8 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {(text || !compact) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-7">
          <div className="flex gap-1" role="radiogroup" aria-label="Save as">
            {MODES.map((m) => (
              <button
                key={m.value}
                role="radio"
                aria-checked={mode === m.value}
                onClick={() => setMode(m.value)}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs",
                  mode === m.value ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-hover",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          {preview && (
            <span className="text-xs text-faint">
              → {TYPE_LABEL[preview.type]}: “{preview.title}”
              {preview.tags.length > 0 && ` · ${preview.tags.map((t) => `#${t}`).join(" ")}`}
            </span>
          )}
          <span className="ml-auto hidden text-xs text-faint sm:inline">Shift+Enter for a new line</span>
        </div>
      )}
      <div className="pl-7">
        <SecretWarning text={text} />
      </div>
    </div>
  );
}
