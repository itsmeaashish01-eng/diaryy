"use client";

import { X } from "lucide-react";
import { useId, useState } from "react";
import { useQuery } from "@/client/api";
import { cn } from "@/lib/cn";
import { normalizeTag } from "@/lib/tags";
import type { TagWithCount } from "@/lib/types";

/** Tag chips with autocomplete. Enter, comma or Tab adds; Backspace removes. */
export function TagInput({
  value,
  onChange,
  id,
  placeholder = "Add tags…",
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  id?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const { data: all } = useQuery<TagWithCount[]>("/api/tags");
  const listId = useId();

  const query = normalizeTag(text);
  const suggestions = (all ?? [])
    .filter((t) => !value.includes(t.name) && (!query || t.name.includes(query)))
    .sort((a, b) => Number(b.name.startsWith(query)) - Number(a.name.startsWith(query)) || b.count - a.count)
    .slice(0, 6);

  const add = (raw: string) => {
    const name = normalizeTag(raw);
    if (name && !value.includes(name)) onChange([...value, name]);
    setText("");
    setActive(-1);
  };

  return (
    <div className="relative">
      <div
        className={cn(
          "flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1",
          focused && "border-accent ring-3 ring-[var(--ring)]",
        )}
      >
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent">
            #{t}
            <button type="button" aria-label={`Remove tag ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={text}
          role="combobox"
          aria-expanded={focused && suggestions.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          placeholder={value.length ? "" : placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (text.trim()) add(text);
          }}
          onChange={(e) => {
            const v = e.target.value;
            if (/[,\s]$/.test(v) && v.trim()) add(v);
            else {
              setText(v);
              setActive(-1);
            }
          }}
          onKeyDown={(e) => {
            const picked = active >= 0 ? suggestions[active] : undefined;
            if ((e.key === "Enter" || e.key === "Tab") && (picked || text.trim())) {
              e.preventDefault();
              add(picked ? picked.name : text);
            } else if (e.key === "Backspace" && !text && value.length) {
              onChange(value.slice(0, -1));
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, suggestions.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, -1));
            }
          }}
          className="min-w-24 flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-faint"
        />
      </div>
      {focused && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full z-30 mt-1 w-full overflow-hidden rounded-md border border-border bg-surface py-1 shadow-pop"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                add(s.name);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn("flex cursor-pointer justify-between px-3 py-1.5 text-sm", i === active && "bg-hover")}
            >
              <span>#{s.name}</span>
              <span className="text-xs text-faint">{s.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
