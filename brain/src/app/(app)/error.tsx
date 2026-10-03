"use client";

import { ErrorBlock } from "@/components/ui/misc";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return <ErrorBlock message={error.message || "This page failed to load."} onRetry={reset} />;
}
