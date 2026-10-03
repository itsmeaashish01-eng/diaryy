import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <div className="mb-3 rounded-full bg-surface-2 p-3 text-faint">
        <Icon className="size-6" />
      </div>
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn("inline-block size-4 animate-spin rounded-full border-2 border-border border-t-accent", className)}
    />
  );
}

export function LoadingBlock() {
  return (
    <div className="flex items-center gap-2 py-10 text-sm text-muted">
      <Spinner /> Loading…
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
      {message}{" "}
      {onRetry && (
        <button className="font-medium underline" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted">
      {children}
    </kbd>
  );
}

export function PageHeader({
  title,
  icon: Icon,
  subtitle,
  actions,
}: {
  title: string;
  icon?: LucideIcon;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          {Icon && <Icon className="size-6 text-muted" />}
          <span className="truncate">{title}</span>
        </h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Pill-shaped segmented control used for view switching. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; count?: number }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1 text-sm whitespace-nowrap transition-colors",
            value === o.value ? "bg-surface font-medium text-text shadow-sm" : "text-muted hover:text-text",
          )}
        >
          {o.label}
          {o.count !== undefined && o.count > 0 && <span className="ml-1.5 text-xs text-faint">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
