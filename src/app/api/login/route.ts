import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveApiUrl(reqUrl: string) {
  const base =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_URL ||
    "cme-monolith.vercel.app/api";
  try {
    new URL(base);
    return base.replace(/\/$/, "");
  } catch {
    const u = new URL(reqUrl);
    return new URL(base, u.origin).toString().replace(/\/$/, "");
  }
}

function isLocalhost(hostname?: string) {
  return !hostname || hostname === "localhost" || hostname === "127.0.0.1";
}

function expireCookie(res: NextResponse, name: string, host: string) {
  const secure = process.env.NODE_ENV === "production" && !isLocalhost(host);
  res.cookies.set(name, "", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: 0,
    expires: new Date(0),
  });
}

function mask(v?: string | null) {
  if (!v) return null;
  if (v.length <= 8) return "****";
  return v.slice(0, 4) + "..." + v.slice(-4);
}

export async function POST(req: Request) {
  const dbg: Record<string, any> = {};
  try {
    const { email, password, rememberMe } = await req.json();
    if (!email || !password) {
      return NextResponse.json(
        { error: "email y password son requeridos" },
        { status: 400 }
      );
    }

    const API = resolveApiUrl(req.url);
    dbg.route = "POST /api/login";
    dbg.api = API;
    dbg.email = email;

    console.log("[login] in", dbg);

    const upstream = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
      credentials: "omit",
    });

    const raw = await upstream.text();
    dbg.upstream_status = upstream.status;
    dbg.upstream_url = `${API}/auth/login`;
    dbg.upstream_body_snippet = raw?.slice(0, 300);

    let json: any = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      console.error("[login] parse_error", dbg);
      return NextResponse.json(
        { error: "upstream_not_json", details: raw?.slice(0, 300), debug: dbg },
        { status: 502 }
      );
    }

    if (!upstream.ok) {
      const message = json?.error || json?.message || `auth_login_upstream_${upstream.status}`;
      console.error("[login] upstream_not_ok", { ...dbg, message });
      return NextResponse.json({ error: message, debug: dbg }, { status: upstream.status || 401 });
    }

    const user = json?.user || json?.profile || null;
    const session = json?.session || json || {};
    const accessToken =
      session?.access_token || session?.accessToken || session?.access || json?.access_token;
    const refreshToken =
      session?.refresh_token || session?.refreshToken || session?.refresh || json?.refresh_token;

    dbg.token_access_mask = mask(accessToken);
    dbg.token_refresh_mask = mask(refreshToken);

    if (!accessToken) {
      console.error("[login] no_access_token", dbg);
      return NextResponse.json(
        { error: "No se recibió access_token del backend", debug: dbg },
        { status: 502 }
      );
    }

    const res = NextResponse.json({ user, debug: dbg });

    const host = new URL(req.url).hostname;
    const toExpire = [
      "session",
      "access_token",
      "refresh_token",
      "id_token",
      "jwt",
      "cme_session",
      "sb-access-token",
      "sb-refresh-token",
      "supabase-auth-token",
      "next-auth.session-token",
      "__Secure-next-auth.session-token",
    ];
    for (const n of toExpire) expireCookie(res, n, host);

    const ACCESS_TTL = rememberMe ? 60 * 60 * 24 * 7 : 60 * 60;
    const secure = process.env.NODE_ENV === "production" && !isLocalhost(host);

    res.cookies.set("access_token", String(accessToken), {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: ACCESS_TTL,
    });

    if (refreshToken) {
      res.cookies.set("refresh_token", String(refreshToken), {
        httpOnly: true,
        secure,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
    }

    console.log("[login] ok", dbg);
    return res;
  } catch (err: any) {
    console.error("[login] fatal", { error: err?.message, ...dbg });
    return NextResponse.json(
      { error: err?.message || "Internal Server Error", debug: dbg },
      { status: 500 }
    );
  }
}
