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

export async function POST(req: Request) {
  try {
    const { email, password, rememberMe } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "email y password son requeridos" },
        { status: 400 }
      );
    }

    const API = resolveApiUrl(req.url);

    const upstream = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
      credentials: "include",
    });

    const raw = await upstream.text();
    let data: any = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      return NextResponse.json(
        { error: "upstream_not_json", details: raw?.slice(0, 300) },
        { status: 502 }
      );
    }

    if (!upstream.ok) {
      const message = data?.error || data?.message || `auth_login_upstream_${upstream.status}`;
      return NextResponse.json({ error: message }, { status: upstream.status || 401 });
    }

    const user = data?.user || data?.profile || null;
    const session = data?.session || data;

    const accessToken =
      session?.access_token || session?.accessToken || session?.access || data?.access_token;
    const refreshToken =
      session?.refresh_token || session?.refreshToken || session?.refresh || data?.refresh_token;

    if (!accessToken) {
      return NextResponse.json(
        { error: "No se recibió access_token del backend" },
        { status: 502 }
      );
    }

    const res = NextResponse.json({ user });

    const ACCESS_TTL = rememberMe ? 60 * 60 * 24 * 7 : 60 * 60;

    res.cookies.set("access_token", String(accessToken), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: ACCESS_TTL,
    });

    if (refreshToken) {
      res.cookies.set("refresh_token", String(refreshToken), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
    }

    return res;
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
