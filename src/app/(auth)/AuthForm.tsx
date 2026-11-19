"use client";

import { useActionState } from "react";
import type { AuthState } from "./actions";
import { Button } from "@/components/ui";

export function AuthForm({
  action,
  children,
  submitLabel,
}: {
  action: (prev: AuthState, fd: FormData) => Promise<AuthState>;
  children: React.ReactNode;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-4">
      {children}
      {state?.error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Aguarde…" : submitLabel}
      </Button>
    </form>
  );
}
