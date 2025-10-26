// app/api/profile/search/route.ts
import { NextRequest, NextResponse } from "next/server";

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

async function readJson(res: Response) {
  const raw = await res.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    const e: any = new Error("upstream_not_json");
    e.__raw = raw?.slice(0, 300);
    throw e;
  }
  return { data, raw };
}

export async function POST(req: NextRequest) {
  try {
    const { input = {} } = await req.json().catch(() => ({ input: {} }));
    const API = resolveApiUrl(req);

    const headers: HeadersInit = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    const auth = buildAuthHeader(req);
    const cookie = req.headers.get("cookie");
    const xReqId = req.headers.get("x-request-id");
    const xCorrId = req.headers.get("x-correlation-id");
    if (auth) (headers as any).Authorization = auth;
    if (cookie) (headers as any).cookie = cookie;
    if (xReqId) (headers as any)["x-request-id"] = xReqId;
    if (xCorrId) (headers as any)["x-correlation-id"] = xCorrId;

    const up = await fetch(`${API}/profiles/search`, {
      method: "POST",
      headers,
      body: JSON.stringify(input),
      cache: "no-store",
      credentials: "include",
    });

    const { data, raw } = await readJson(up);

    if (!up.ok) {
      const msg = data?.error || data?.message || `profiles_search_upstream_${up.status}`;
      return NextResponse.json(
        { error: msg, raw: data ?? raw, target: `${API}/profiles/search` },
        { status: up.status || 502 }
      );
    }

    const items = Array.isArray(data) ? data : data?.items ?? data ?? [];
    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Search error (proxy)", __debug: e?.__raw ?? null },
      { status: 500 }
    );
  }
}
