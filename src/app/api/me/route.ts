import { NextResponse } from "next/server";
import { headers as nextHeaders, cookies as nextCookies } from "next/headers";

function resolveApiUrl() {
  const base =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_URL ||
    "http://localhost:3000/api";
  try {
    new URL(base);
    return base.replace(/\/$/, "");
  } catch {
    return "http://localhost:3000/api";
  }
}

export async function GET() {
  try {
    const API = resolveApiUrl();

    const hdrs = await nextHeaders();
    const cookieStore = await nextCookies();
    const cookieHeader = cookieStore.toString();

    const access = cookieStore.get("access_token")?.value;
    const authHeader = access ? `Bearer ${access}` : undefined;

    const upstream = await fetch(`${API}/auth/me`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        cookie: cookieHeader,
        ...(authHeader ? { Authorization: authHeader } : {}),
        "x-correlation-id": hdrs.get("x-correlation-id") || "",
      },
      credentials: "include",
      cache: "no-store",
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
      const msg = data?.error || data?.message || `auth_me_upstream_${upstream.status}`;
      return NextResponse.json({ error: msg }, { status: upstream.status || 401 });
    }

    const user = data ?? null;
    return NextResponse.json({ user });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Internal Error" },
      { status: 500 }
    );
  }
}
