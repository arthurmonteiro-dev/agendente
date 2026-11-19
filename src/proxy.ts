import { NextResponse, type NextRequest } from "next/server";

/** Barreira leve: sem cookie de sessão, nem tenta renderizar o painel. A validação real fica em requireUser(). */
export function proxy(request: NextRequest) {
  if (!request.cookies.has("ag_session")) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/painel/:path*", "/admin/:path*"],
};
