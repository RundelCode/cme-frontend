import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const PAYMENTS_BASE =
  process.env.PAYMENTS_BASE_URL ??
  process.env.API_GATEWAY_URL ??
  "http://localhost:3005"; // Payment Service

// Endpoints auxiliares para resolver companyId del admin autenticado:
const PROFILES_BASE = process.env.PROFILES_BASE_URL ?? "http://localhost:3001";
const COMPANIES_BASE = process.env.COMPANIES_BASE_URL ?? "http://localhost:3009";

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

async function fetchJson(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.message || data?.error || `upstream_error (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    const authorization = buildAuthHeader(req);
    const cookie = req.headers.get("cookie") ?? "";

    // 1) Perfil ⇒ userId
    const me = await fetchJson(`${PROFILES_BASE}/profiles/me`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(authorization ? { authorization } : {}),
        cookie,
      },
      cache: "no-store",
    });

    const userId: string | undefined = me?.id;
    if (!userId) {
      return NextResponse.json(
        { total: 0, items: [], error: "No autenticado (sin userId)" },
        { status: 401 }
      );
    }

    const company = await fetchJson(`${COMPANIES_BASE}/companies/by-admin/${userId}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(authorization ? { authorization } : {}),
        cookie,
      },
      cache: "no-store",
    });

    const companyId: string | undefined = company?.id;
    if (!companyId) {
      return NextResponse.json(
        { total: 0, items: [], note: "No se encontró empresa para este admin" },
        { status: 200 }
      );
    }

    const qs = new URLSearchParams();
    qs.set("companyId", companyId);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);

    const target = `${PAYMENTS_BASE}/payments?${qs.toString()}`;

    const payments = await fetchJson(target, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(authorization ? { authorization } : {}),
        cookie,
      },
      cache: "no-store",
    });

    return NextResponse.json(payments);
  } catch (e: any) {
    const msg = e?.message || "finance_proxy_error";
    const isAuth = /unauthorized|forbidden|token|auth/i.test(msg);
    return NextResponse.json(
      { total: 0, items: [], error: msg },
      { status: isAuth ? 401 : 500 }
    );
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}
