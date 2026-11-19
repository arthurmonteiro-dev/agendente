"use client";

import { useActionState, type ReactNode } from "react";
import { Button } from "./ui";

export type ActionResult = { ok?: boolean; error?: string; message?: string; seq?: number } | null;

/** Formulário que chama uma Server Action e mostra "Salvo" ou o erro. */
export function ActionForm({
  action,
  children,
  submitLabel = "Salvar",
  className,
  resetOnSuccess,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  children: ReactNode;
  submitLabel?: string;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const res = await action(prev, fd);
    // seq muda a cada sucesso: usado como key para limpar formulários de criação
    return res?.ok ? { ...res, seq: (prev?.seq ?? 0) + 1 } : { ...res, seq: prev?.seq ?? 0 };
  }, null);
  return (
    <form
      action={formAction}
      className={className}
      key={resetOnSuccess ? (state?.seq ?? 0) : undefined}
    >
      {children}
      <div className="mt-4 flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : submitLabel}
        </Button>
        {state?.ok && <span className="text-sm text-emerald-700">{state.message || "Salvo ✓"}</span>}
        {state?.error && <span className="text-sm text-rose-600">{state.error}</span>}
      </div>
    </form>
  );
}
