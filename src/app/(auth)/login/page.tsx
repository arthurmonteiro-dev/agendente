import Link from "next/link";
import { Field, Input } from "@/components/ui";
import { loginAction } from "../actions";
import { AuthForm } from "../AuthForm";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return (
    <>
      <h1 className="text-xl font-semibold">Entrar no painel</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">Acesse a agenda e as conversas da sua clínica.</p>
      <AuthForm action={loginAction} submitLabel="Entrar">
        <input type="hidden" name="next" value={typeof next === "string" ? next : ""} />
        <Field label="E-mail">
          <Input name="email" type="email" required autoComplete="email" />
        </Field>
        <Field label="Senha">
          <Input name="password" type="password" required autoComplete="current-password" />
        </Field>
      </AuthForm>
      <p className="mt-6 text-center text-sm text-slate-500">
        Ainda não tem conta?{" "}
        <Link href="/cadastro" className="font-medium text-brand-700 hover:underline">
          Teste grátis por 14 dias
        </Link>
      </p>
    </>
  );
}
