"use client";

import * as RD from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  hideTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  hideTitle?: boolean;
}) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
        <RD.Content
          className={cn(
            "fixed top-[8vh] left-1/2 z-50 max-h-[84vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 overflow-y-auto rounded-xl border border-border bg-surface p-5 shadow-pop outline-none",
            className,
          )}
        >
          <div className={cn("mb-4 flex items-start justify-between gap-4", hideTitle && "sr-only")}>
            <div>
              <RD.Title className="text-base font-semibold">{title}</RD.Title>
              {description ? (
                <RD.Description className="mt-0.5 text-sm text-muted">{description}</RD.Description>
              ) : (
                <RD.Description className="sr-only">{title}</RD.Description>
              )}
            </div>
            <RD.Close aria-label="Close" className="rounded-md p-1 text-faint hover:bg-hover hover:text-text">
              <X className="size-4" />
            </RD.Close>
          </div>
          {children}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}

/** A yes/no confirmation built on Dialog. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <div className="flex justify-end gap-2">
        <button
          className="h-9 rounded-md border border-border px-3.5 text-sm font-medium hover:bg-hover"
          onClick={() => onOpenChange(false)}
        >
          Cancel
        </button>
        <button
          autoFocus
          className="h-9 rounded-md bg-danger px-3.5 text-sm font-medium text-white hover:opacity-90"
          onClick={() => {
            onConfirm();
            onOpenChange(false);
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
