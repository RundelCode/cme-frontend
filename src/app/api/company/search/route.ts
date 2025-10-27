// app/api/company/search/route.ts
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
    "http://localhost:3000/api";
  if (/^https?:\/\//i.test(base)) return base.replace(/\/+$/, "");
  return new URL(base, req.nextUrl.origin).toString().replace(/\/+$/, "");
}

function buildQS(input: Record<string, any> = {}) {
  const qs = new URLSearchParams();
  if (input.q) qs.set("q", String(input.q));
  if (input.sortBy) qs.set("orderBy", String(input.sortBy));
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
  return qs.toString();
}

function camelCompany(c: any) {
  if (!c) return c;
  return {
    id: c.id,
    name: c.name,
    email: c.email ?? null,
    website: c.website ?? null,
    description: c.description ?? null,
    industry: c.industry ?? null,
    location: c.location ?? null,
    profilePicture: c.profile_picture ?? null,
    coverPhoto: c.cover_photo ?? null,
    companyRating: c.company_rating ?? null,
    boolVerified: c.bool_verified ?? null,
    verifiedAt: c.verified_at ?? null,
    subscriptionPlan: c.subscription_plan ?? null,
    adminId: c.admin_id ?? null,
    createdAt: c.created_at,
    updatedAt: c.updated_at ?? null,
  };
}

async function upstreamSearch(req: NextRequest, input: Record<string, any>) {
  const API = resolveApiUrl(req);
  const query = buildQS(input);

  const headers: Record<string, string> = { Accept: "application/json" };
  const auth = buildAuthHeader(req);
  const xReqId = req.headers.get("x-request-id");
  const xCorrId = req.headers.get("x-correlation-id");
  if (auth) headers["Authorization"] = auth;
  if (xReqId) headers["x-request-id"] = xReqId;
  if (xCorrId) headers["x-correlation-id"] = xCorrId;

  const url = `${API}/companies${query ? `?${query}` : ""}`;
  const upstream = await fetch(url, { method: "GET", headers, cache: "no-store" });

  const raw = await upstream.text();
  let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { }

  if (!upstream.ok) {
    return NextResponse.json({ error: `companies_search_upstream_${upstream.status}`, raw: data ?? raw, target: url }, { status: upstream.status || 502 });
  }

  const list = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
  const items = list.map(camelCompany);
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  try {
    const { input = {} } = await req.json().catch(() => ({ input: {} }));
    return await upstreamSearch(req, input);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Search error (proxy)" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const input: Record<string, any> = {};
    url.searchParams.forEach((v, k) => (input[k] = v));
    return await upstreamSearch(req, input);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Search error (proxy)" }, { status: 500 });
  }
}
