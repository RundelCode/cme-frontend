// src/app/api/jobs/search/route.ts
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

async function readUpstream(res: Response) {
  const text = await res.text().catch(() => "");
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { }
  return { ok: res.ok, status: res.status, data, text, url: res.url, ctype: res.headers.get("content-type") || "" };
}

export async function GET(req: NextRequest) {
  try {
    const API = resolveApiUrl(req);
    const url = new URL(req.url);
    const authorization = buildAuthHeader(req);
    const cookie = req.headers.get("cookie") ?? "";

    const companyId = url.searchParams.get("companyId") || "";
    const limit = url.searchParams.get("limit") || "10";
    const offset = url.searchParams.get("offset") || "0";
    const orderBy = url.searchParams.get("orderBy") || "created_at_desc";

    const qs = new URLSearchParams();
    if (companyId) qs.set("companyId", companyId);
    qs.set("limit", limit);
    qs.set("offset", offset);
    qs.set("orderBy", orderBy);

    const targets = [
      `${API}/job_offers/search?${qs.toString()}`,
      `${API}/jobs/search?${qs.toString()}`,
      `${API}/job-offers/search?${qs.toString()}`
    ];

    const headers: HeadersInit = {
      Accept: "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
      ...(cookie ? { cookie } : {}),
    };

    let payload: any = null;
    let status = 502;

    for (const t of targets) {
      const r = await fetch(t, { method: "GET", headers, cache: "no-store", credentials: "include" });
      const parsed = await readUpstream(r);
      if (parsed.ok && (parsed.ctype.includes("application/json") || typeof parsed.data === "object")) {
        payload = parsed.data ?? {};
        status = parsed.status;
        break;
      }
      status = parsed.status;
    }

    if (!payload) {
      return NextResponse.json({ total: 0, items: [], error: `jobs_upstream_${status}` }, { status: status || 502 });
    }

    const normalized = Array.isArray(payload)
      ? { total: payload.length, items: payload }
      : payload?.data && typeof payload.data === "object"
        ? { total: Number(payload.data.total ?? (payload.data.items?.length || 0)), items: payload.data.items ?? [] }
        : { total: Number(payload.total ?? (payload.items?.length || 0)), items: payload.items ?? payload.jobs ?? [] };

    return NextResponse.json({ total: normalized.total || 0, items: normalized.items || [] }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "jobs_search_proxy_error";
    const isAuth = /unauthorized|forbidden|token|auth/i.test(msg);
    return NextResponse.json({ total: 0, items: [], error: msg }, { status: isAuth ? 401 : 500 });
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}
