import Link from "next/link";
import { Field, Input } from "@/components/ui";
import { signupAction } from "../actions";
import { AuthForm } from "../AuthForm";

export const metadata = { title: "Criar conta" };

export default function SignupPage() {
  return (
    <>
      <h1 className="text-xl font-semibold">Comece seu teste grátis</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">14 dias sem custo, sem cartão de crédito.</p>
      <AuthForm action={signupAction} submitLabel="Criar minha conta">
        {/* Armadilha para robôs: invisível para pessoas */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
        <Field label="Seu nome">
          <Input name="ownerName" required placeholder="Ex.: Ana Souza" />
        </Field>
        <Field label="Nome da clínica">
          <Input name="clinicName" required placeholder="Ex.: Clínica Sorriso" />
        </Field>
        <Field label="WhatsApp da clínica">
          <Input name="phone" placeholder="(11) 99999-0000" />
        </Field>
        <Field label="E-mail">
          <Input name="email" type="email" required autoComplete="email" />
        </Field>
        <Field label="Senha" hint="Mínimo de 10 caracteres">
          <Input name="password" type="password" required minLength={10} autoComplete="new-password" />
        </Field>
        <label className="flex items-start gap-2 text-sm text-slate-600">
          <input type="checkbox" name="aceite" required className="mt-1" />
          <span>
            Li e aceito os{" "}
            <Link href="/termos" target="_blank" className="font-medium text-brand-700 hover:underline">Termos de uso</Link>{" "}
            e a{" "}
            <Link href="/privacidade" target="_blank" className="font-medium text-brand-700 hover:underline">Política de privacidade</Link>,
            incluindo o tratamento de dados de pacientes como operador em nome da minha clínica.
          </span>
        </label>
      </AuthForm>
      <p className="mt-6 text-center text-sm text-slate-500">
        Já tem conta?{" "}
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          Entrar
        </Link>
      </p>
    </>
  );
}
