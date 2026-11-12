"use client";

import { useActionState } from "react";
import type { FormState } from "@/server/forms";

export function ActionForm({
  action,
  children,
  submitLabel = "Save",
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  children: React.ReactNode;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, { error: "" });
  return (
    <form action={formAction} className="grid gap-3">
      {children}
      {state.error ? <p role="alert" className="text-sm font-bold text-clay">{state.error}</p> : null}
      {state.notice ? <p role="status" className="text-sm">{state.notice}</p> : null}
      <button className="btn" disabled={pending}>{pending ? "Saving…" : submitLabel}</button>
    </form>
  );
}
