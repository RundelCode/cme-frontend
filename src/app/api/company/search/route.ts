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
    const { input = {} } = await req.json().catch(() => ({ input: {} }));
    const API = resolveApiUrl(req);

    const qs = new URLSearchParams();
    if (input.q) qs.set("q", String(input.q));
    if (input.sortBy) qs.set("sortBy", String(input.sortBy));
    if (input.order) qs.set("order", String(input.order));
    if (input.limit != null) qs.set("limit", String(input.limit));
    if (input.offset != null) qs.set("offset", String(input.offset));
    if (input.industry) qs.set("industry", String(input.industry));
    if (input.location) qs.set("location", String(input.location));
    if (input.boolVerified != null) qs.set("boolVerified", String(input.boolVerified));
    if (input.subscriptionPlan) qs.set("subscriptionPlan", String(input.subscriptionPlan));
    if (input.minRating != null) qs.set("minRating", String(input.minRating));
    if (input.maxRating != null) qs.set("maxRating", String(input.maxRating));
    if (input.adminId) qs.set("adminId", String(input.adminId));

    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    const auth = buildAuthHeader(req);
    const cookie = req.headers.get("cookie");
    const xReqId = req.headers.get("x-request-id");
    const xCorrId = req.headers.get("x-correlation-id");
    if (auth) headers["Authorization"] = auth;
    if (cookie) headers["cookie"] = cookie;
    if (xReqId) headers["x-request-id"] = xReqId as string;
    if (xCorrId) headers["x-correlation-id"] = xCorrId as string;

    const upstream = await fetch(`${API}/companies/search?${qs.toString()}`, {
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
      data = null;
    }

    if (!upstream.ok) {
      return NextResponse.json(
        {
          error: `companies_search_upstream_${upstream.status}`,
          raw: data ?? raw,
          target: `${API}/companies/search`,
        },
        { status: upstream.status || 502 }
      );
    }

    const items = Array.isArray(data) ? data : data?.items ?? [];
    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Search error (proxy)" },
      { status: 500 }
    );
  }
}
