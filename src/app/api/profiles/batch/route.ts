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

async function fetchJsonDebug(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  const raw = await res.text().catch(() => "");
  let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; } catch {}
  if (!res.ok) {
    const msg = data?.message || data?.error || `upstream_error (${res.status})`;
    const detail = { url, status: res.status, raw: raw?.slice(0, 500) };
    console.error("[profiles/batch] Upstream error:", msg, detail);
    const err: any = new Error(msg);
    err.status = res.status;
    err.raw = raw;
    throw err;
  }
  return data ?? null;
}

export async function POST(req: NextRequest) {
  const debug: Record<string, any> = {};
  try {
    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
    if (!ids.length) return NextResponse.json({ profiles: [] }, { status: 200 });

    const API = resolveApiUrl(req);
    const authorization = buildAuthHeader(req);
    const cookie = req.headers.get("cookie") ?? "";

    const commonHeaders: HeadersInit = {
      Accept: "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
      ...(cookie ? { cookie } : {}),
    };

    try {
      const url = `${API}/profiles/batch`;
      debug.postUrl = url;
      const data = await fetchJsonDebug(url, {
        method: "POST",
        headers: { ...commonHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
        cache: "no-store",
        credentials: "include",
      });
      const profiles = Array.isArray(data) ? data : data?.profiles ?? [];
      return NextResponse.json({ profiles });
    } catch (e: any) {
      debug.postErr = e?.message || String(e);
    }

    try {
      const url = `${API}/profiles?ids=${encodeURIComponent(ids.join(","))}`;
      debug.getUrl = url;
      const data = await fetchJsonDebug(url, {
        method: "GET",
        headers: commonHeaders,
        cache: "no-store",
        credentials: "include",
      });
      const profiles = Array.isArray(data) ? data : data?.profiles ?? [];
      return NextResponse.json({ profiles });
    } catch (e: any) {
      debug.getErr = e?.message || String(e);
    }

    try {
      debug.nRequests = ids.length;
      const results = await Promise.allSettled(
        ids.map((id) =>
          fetchJsonDebug(`${API}/profiles/${encodeURIComponent(id)}`, {
            method: "GET",
            headers: commonHeaders,
            cache: "no-store",
            credentials: "include",
          })
        )
      );
      const profiles = results
        .filter((r) => r.status === "fulfilled")
        .map((r: any) => r.value)
        .filter(Boolean);

      if (profiles.length === 0) {
        return NextResponse.json(
          { profiles: [], error: "no_profiles_from_upstream", debug },
          { status: 502 }
        );
      }
      return NextResponse.json({ profiles, debug });
    } catch (e: any) {
      debug.nRequestsErr = e?.message || String(e);
      return NextResponse.json(
        { profiles: [], error: "profiles_batch_proxy_error", debug },
        { status: 502 }
      );
    }
  } catch (e: any) {
    const msg = e?.message || "profiles_batch_proxy_error";
    const isAuth = /unauthorized|forbidden|token|auth/i.test(msg);
    return NextResponse.json({ profiles: [], error: msg, debug }, { status: isAuth ? 401 : 500 });
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}
