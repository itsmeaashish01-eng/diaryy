import { ShieldAlert } from "lucide-react";
import { detectSecret } from "@/lib/secrets";

/** Shown under a text field when its content looks like a credential. */
export function SecretWarning({ text }: { text: string }) {
  const kind = detectSecret(text);
  if (!kind) return null;
  return (
    <p role="alert" className="mt-1.5 flex items-start gap-1.5 rounded-md bg-warn-soft px-2.5 py-1.5 text-xs text-warn">
      <ShieldAlert className="mt-px size-3.5 shrink-0" />
      <span>
        This looks like {kind}. Brain stores text unencrypted — keep secrets in your password manager and save a link to
        the entry instead (the “Password manager link” field on Links).
      </span>
    </p>
  );
}
