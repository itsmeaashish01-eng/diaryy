"use client";

import { Archive, Bell, Download, Keyboard, LogOut, Monitor, Moon, Settings, Shield, Sun, Upload } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { api, invalidate, useQuery } from "@/client/api";
import { getTheme, setTheme, type ThemeChoice } from "@/client/theme";
import { useToast } from "@/client/toast";
import { useAppUi } from "@/client/ui-state";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/misc";
import { cn } from "@/lib/cn";

function Card({ title, icon: Icon, children }: { title: string; icon: typeof Settings; children: ReactNode }) {
  return (
    <section className="mb-6 rounded-xl border border-border bg-surface p-5">
      <h2 className="mb-3 flex items-center gap-2 font-semibold">
        <Icon className="size-4 text-muted" /> {title}
      </h2>
      {children}
    </section>
  );
}

function ThemePicker() {
  const theme = useSyncExternalStore<ThemeChoice>(
    (onChange) => {
      window.addEventListener("brain-theme", onChange);
      return () => window.removeEventListener("brain-theme", onChange);
    },
    getTheme,
    () => "system",
  );
  const options: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ];
  return (
    <div role="radiogroup" aria-label="Theme" className="grid max-w-md grid-cols-3 gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={theme === o.value}
          onClick={() => setTheme(o.value)}
          className={cn(
            "flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-sm",
            theme === o.value ? "border-accent bg-accent-soft font-medium text-accent" : "border-border hover:bg-hover",
          )}
        >
          <o.icon className="size-5" />
          {o.label}
        </button>
      ))}
    </div>
  );
}

function RestoreBackup() {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ data: unknown; name: string } | null>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!pending) return;
    setBusy(true);
    try {
      const r = await api<{ items: number; folders: number }>("/api/import", { method: "POST", body: { mode, data: pending.data } });
      await invalidate();
      toast.show(`Restored ${r.items} items and ${r.folders} folders`, { tone: "success" });
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  return (
    <div>
      <p className="mb-3 text-sm text-muted">
        Restore from a JSON backup. <strong>Merge</strong> adds it to what is here (items with the same id are replaced);{" "}
        <strong>Replace</strong> deletes everything first.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Restore mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as "merge" | "replace")}
          className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
        >
          <option value="merge">Merge with current data</option>
          <option value="replace">Replace all current data</option>
        </select>
        <Button onClick={() => input.current?.click()} disabled={busy}>
          <Upload className="size-4" /> {busy ? "Restoring…" : "Choose backup file…"}
        </Button>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              setPending({ data: JSON.parse(await file.text()), name: file.name });
            } catch {
              toast.show("That file is not valid JSON.", { tone: "error" });
            }
          }}
        />
      </div>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title={mode === "replace" ? "Replace everything?" : "Merge this backup?"}
        description={
          mode === "replace"
            ? `All current items, folders and tags will be deleted and replaced with “${pending?.name}”. Export a backup first if unsure.`
            : `Items from “${pending?.name}” will be added. Items with the same id are overwritten.`
        }
        confirmLabel={mode === "replace" ? "Replace" : "Merge"}
        onConfirm={() => void run()}
      />
    </div>
  );
}

function NotificationsSetting() {
  const initial = useSyncExternalStore<NotificationPermission | "unsupported">(
    () => () => {},
    () => ("Notification" in window ? Notification.permission : "unsupported"),
    () => "default",
  );
  const [asked, setPerm] = useState<NotificationPermission | null>(null);
  const perm = asked ?? initial;
  if (perm === "unsupported") return <p className="text-sm text-muted">This browser does not support notifications. Reminders still appear inside Brain.</p>;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="flex-1 text-sm text-muted">
        Reminders always appear inside Brain while it is open. Allow notifications to also get a system alert.
      </p>
      {perm === "granted" ? (
        <span className="text-sm font-medium text-ok">Notifications on</span>
      ) : perm === "denied" ? (
        <span className="text-sm text-muted">Blocked in browser settings</span>
      ) : (
        <Button onClick={() => void Notification.requestPermission().then(setPerm)}>Allow notifications</Button>
      )}
    </div>
  );
}

export function SettingsView() {
  const ui = useAppUi();
  const { data: auth } = useQuery<{ enabled: boolean }>("/api/auth/status");
  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" icon={Settings} />

      <Card title="Appearance" icon={Sun}>
        <ThemePicker />
      </Card>

      <Card title="Export & backup" icon={Download}>
        <p className="mb-3 text-sm text-muted">
          Your data is yours. The JSON backup contains everything and can be restored below; Markdown and CSV are for
          reading and using elsewhere.
        </p>
        <div className="flex flex-wrap gap-2">
          <a href="/api/export?format=json" className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3.5 text-sm font-medium text-accent-fg hover:opacity-90">
            <Download className="size-4" /> Full backup (JSON)
          </a>
          <a href="/api/export?format=markdown" className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3.5 text-sm font-medium hover:bg-hover">
            Markdown (.zip)
          </a>
          {(["tasks", "notes", "bookmarks", "links"] as const).map((t) => (
            <a key={t} href={`/api/export?format=csv&type=${t}`} className="inline-flex h-9 items-center rounded-md border border-border px-3.5 text-sm font-medium capitalize hover:bg-hover">
              {t} CSV
            </a>
          ))}
        </div>
        <hr className="my-5 border-border" />
        <RestoreBackup />
      </Card>

      <Card title="Reminders" icon={Bell}>
        <NotificationsSetting />
      </Card>

      <Card title="Privacy & security" icon={Shield}>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
          <li>Everything is stored in a SQLite file on this computer (<code>brain/data/brain.db</code>). Nothing is sent to any cloud service.</li>
          <li>
            Brain is not a password manager. Store passwords, recovery codes and card numbers in your password manager, and
            save a link to the entry on a Link instead.
          </li>
          <li>
            Password protection is <strong>{auth?.enabled ? "on" : "off"}</strong>.{" "}
            {auth?.enabled
              ? "Sessions last 30 days."
              : "The server only listens on this computer. Turn protection on before opening it to other devices — see the README."}
          </li>
        </ul>
        {auth?.enabled && (
          <Button
            className="mt-4"
            onClick={async () => {
              await api("/api/auth/logout", { method: "POST" });
              window.location.assign(new URL("/login", window.location.origin).toString());
            }}
          >
            <LogOut className="size-4" /> Sign out
          </Button>
        )}
      </Card>

      <Card title="More" icon={Keyboard}>
        <div className="flex flex-wrap gap-2">
          <Button onClick={ui.openShortcuts}>
            <Keyboard className="size-4" /> Keyboard shortcuts
          </Button>
          <Link href="/archive" className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3.5 text-sm font-medium hover:bg-hover">
            <Archive className="size-4" /> Archived items
          </Link>
        </div>
      </Card>
    </div>
  );
}
