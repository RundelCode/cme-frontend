// middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/** Rutas públicas que nunca deben bloquearse */
const PUBLIC_PREFIXES = [
  "/",
  "/auth",
  "/login",
  "/register",
  "/jobs",
  "/profiles",
  "/search",
];

/** Bypass para recursos estáticos y APIs */
function isBypassedPath(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/images") ||
    pathname.startsWith("/public") ||
    pathname.startsWith("/api") ||        // <- muy importante: NO tocar APIs
    pathname === "/"
  );
}

function readAccessToken(req: NextRequest): string | null {
  const raw =
    req.cookies.get("access_token")?.value ??
    req.cookies.get("token")?.value ??
    req.cookies.get("auth")?.value ??
    null;

  if (!raw) return null;
  const v = String(raw).trim();
  if (!v || v === "null" || v === "undefined") return null;
  return v;
}

export function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const pathname = url.pathname;

  // 0) Nunca interceptar APIs ni estáticos
  if (isBypassedPath(pathname)) {
    return NextResponse.next();
  }

  // 1) Páginas públicas: siempre dejar pasar
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  // 2) Verificar cookie de sesión
  const token = readAccessToken(req);
  if (token) {
    // (opcional) header para testear si el middleware corre
    const res = NextResponse.next();
    res.headers.set("x-mw", "hit");
    return res;
  }

  // 3) Redirigir a login con ?next
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", pathname + (url.search || ""));
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/applications/:path*",
    "/company/:path*",
    "/createCompany/:path*",
    "/finance/:path*",
    "/notifications/:path*",
    "/profile/:path*",
    "/dashboard/:path*",
    "/profiles/me/:path*",
    "/referrals/:path*",
    "/settings/:path*",
    "/updateCompany/:path*",
  ],
};
