import { Field, Input, Textarea } from "@/components/ui";
import type { Patient } from "@prisma/client";
import { formatPhone } from "@/lib/phone";

export function PatientFields({ p }: { p?: Patient }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {p && <input type="hidden" name="id" value={p.id} />}
      <Field label="Nome completo">
        <Input name="name" defaultValue={p?.name ?? ""} required />
      </Field>
      <Field label="WhatsApp (com DDD)">
        <Input name="phone" defaultValue={p ? formatPhone(p.phone) : ""} required />
      </Field>
      <Field label="E-mail">
        <Input name="email" type="email" defaultValue={p?.email ?? ""} />
      </Field>
      <Field label="Data de nascimento">
        <Input name="birthDate" type="date" defaultValue={p?.birthDate ? p.birthDate.toISOString().slice(0, 10) : ""} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Observações internas">
          <Textarea name="notes" defaultValue={p?.notes ?? ""} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-600 sm:col-span-2">
        <input type="checkbox" name="optOut" defaultChecked={p?.optOut} /> Não enviar mensagens automáticas (lembretes e campanhas)
      </label>
    </div>
  );
}
