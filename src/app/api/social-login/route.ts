import { NextResponse } from "next/server";

function resolveApiUrl(reqUrl: string) {
  const base =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_URL ||
    "http://localhost:3000/api";
  try {
    new URL(base);
    return base.replace(/\/$/, "");
  } catch {
    const u = new URL(reqUrl);
    return new URL(base, u.origin).toString().replace(/\/$/, "");
  }
}

async function readJson(res: Response) {
  const raw = await res.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    const e: any = new Error("upstream_not_json");
    e.status = res.status;
    e.raw = raw?.slice(0, 600);
    throw e;
  }
  return { data, raw };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
    };

    const incomingToken = body?.access_token ?? null;
    const incomingRefresh = body?.refresh_token ?? null;

    if (!incomingToken) {
      return NextResponse.json({ error: "No access_token" }, { status: 400 });
    }

    const API = resolveApiUrl(req.url);

    const upstream = await fetch(`${API}/auth/social-login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        // algunas implementaciones requieren el bearer entrante
        Authorization: `Bearer ${incomingToken}`,
      },
      body: JSON.stringify({
        access_token: incomingToken,
        ...(incomingRefresh ? { refresh_token: incomingRefresh } : {}),
      }),
      cache: "no-store",
      credentials: "include",
    });

    const { data, raw } = await readJson(upstream);

    if (!upstream.ok) {
      const msg = data?.error || data?.message || `auth_social_login_upstream_${upstream.status}`;
      return NextResponse.json({ error: msg, raw: data ?? raw }, { status: upstream.status || 502 });
    }

    // Normalizamos formas comunes de respuesta
    const user = data?.user ?? data?.profile ?? null;
    const session = data?.session ?? data;

    const accessToken =
      session?.access_token || session?.accessToken || session?.access || null;
    const refreshToken =
      session?.refresh_token || session?.refreshToken || session?.refresh || null;

    if (!accessToken) {
      return NextResponse.json({ error: "no session" }, { status: 500 });
    }

    const isProd = process.env.NODE_ENV === "production";
    const cookieDomain = process.env.COOKIE_DOMAIN || undefined;
    const sameSiteVal = (process.env.COOKIE_SAMESITE as any) || (isProd ? "none" : "lax");

    // TTLs igual que antes
    const ACCESS_TTL = 60 * 60 * 24 * 7;  // 7d
    const REFRESH_TTL = 60 * 60 * 24 * 30; // 30d

    const res = NextResponse.json({ ok: true, user });

    res.cookies.set("access_token", String(accessToken), {
      httpOnly: true,
      secure: isProd,
      sameSite: sameSiteVal,
      path: "/",
      maxAge: ACCESS_TTL,
      domain: cookieDomain,
    });

    if (refreshToken) {
      res.cookies.set("refresh_token", String(refreshToken), {
        httpOnly: true,
        secure: isProd,
        sameSite: sameSiteVal,
        path: "/",
        maxAge: REFRESH_TTL,
        domain: cookieDomain,
      });
    }

    return res;
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Internal Server Error", raw: err?.raw ?? null },
      { status: err?.status || 500 }
    );
  }
}
