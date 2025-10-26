import { NextRequest, NextResponse } from "next/server";

function buildAuthHeader(req: NextRequest): string | undefined {
  const fromHeader = req.headers.get("authorization");
  if (fromHeader && fromHeader.trim() !== "") return fromHeader;
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

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "Missing 'id' in body" }, { status: 400 });

    const API = resolveApiUrl(req);
    const authorization = buildAuthHeader(req);
    const cookie = req.headers.get("cookie") ?? "";
    const xReqId = req.headers.get("x-request-id");
    const xCorrId = req.headers.get("x-correlation-id");

    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
      ...(cookie ? { cookie } : {}),
      ...(xReqId ? { "x-request-id": xReqId } : {}),
      ...(xCorrId ? { "x-correlation-id": xCorrId } : {}),
    };

    const upstream = await fetch(`${API}/companies/${encodeURIComponent(id)}`, {
      method: "GET",
      headers,
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

    if (!upstream.ok || !data?.id) {
      const message =
        data?.error ||
        data?.message ||
        `companies_upstream_${upstream.status}`;
      return NextResponse.json({ error: message }, { status: upstream.status || 400 });
    }

    return NextResponse.json({ company: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
