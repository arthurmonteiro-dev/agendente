import { NextResponse } from "next/server";
import { getCurrentUser } from "./auth";

export async function apiUser() {
  return getCurrentUser();
}

export function unauthorized() {
  return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
}

export function badRequest(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}
