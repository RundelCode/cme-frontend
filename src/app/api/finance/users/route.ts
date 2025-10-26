import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function buildAuthHeader(req: NextRequest): string | undefined {
  const fromHeader = req.headers.get("authorization");
  if (fromHeader && fromHeader.trim() !== "") return fromHeader;
  const token = req.cookies.get("access_token")?.value;
  if (token && token.trim() !== "") return `Bearer ${token}`;
  const cookieHeader = req.headers.get("cookie") ?? "";
  const m = cookieHeader.match(/(?:^|;\s*)access_token=([^;]+)/i);
  if (m?.[1]) return `Bearer ${decodeURIComponent(m[1])}`;
  return undefined;
}

function resolveApiUrl(req: NextRequest) {
  const base =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_URL ||
    "http://localhost:3000/api";
  if (/^https?:\/\//i.test(base)) return base.replace(/\/$/, "");
  return new URL(base, req.nextUrl.origin).toString().replace(/\/$/, "");
}

async function fetchJson(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.message || data?.error || `upstream_error (${res.status})`;
    const err: any = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function GET(req: NextRequest) {
  try {
    const API = resolveApiUrl(req);
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    const authorization = buildAuthHeader(req);
    const cookie = req.headers.get("cookie") ?? "";

    const baseHeaders: HeadersInit = {
      Accept: "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
      ...(cookie ? { cookie } : {}),
    };

    let me: any = null;
    try {
      me = await fetchJson(`${API}/auth/me`, {
        method: "GET",
        headers: baseHeaders,
        cache: "no-store",
        credentials: "include",
      });
    } catch (e: any) {
      if (e?.status !== 404) {
        try {
          me = await fetchJson(`${API}/profiles/me`, {
            method: "GET",
            headers: baseHeaders,
            cache: "no-store",
            credentials: "include",
          });
        } catch (e2: any) {
          return NextResponse.json(
            { total: 0, items: [], error: e2?.message || "No autenticado" },
            { status: e2?.status === 401 ? 401 : 500 }
          );
        }
      } else {
        return NextResponse.json(
          { total: 0, items: [], error: e?.message || "No autenticado" },
          { status: e?.status === 401 ? 401 : 500 }
        );
      }
    }

    const userId: string | undefined = me?.id;
    if (!userId) {
      return NextResponse.json(
        { total: 0, items: [], error: "No autenticado (sin userId)" },
        { status: 401 }
      );
    }

    const qs = new URLSearchParams();
    qs.set("headhunterId", userId);
    qs.set("all", "true");
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);

    const payments = await fetchJson(`${API}/payments?${qs.toString()}`, {
      method: "GET",
      headers: baseHeaders,
      cache: "no-store",
      credentials: "include",
    });

    return NextResponse.json(payments);
  } catch (e: any) {
    const msg = e?.message || "finance_users_proxy_error";
    const isAuth = /unauthorized|forbidden|token|auth/i.test(msg);
    return NextResponse.json(
      { total: 0, items: [], error: msg },
      { status: isAuth ? 401 : e?.status || 500 }
    );
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}
