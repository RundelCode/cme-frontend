// app/api/company/route.ts
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
    "https://cme-monolith-7hth.onrender.com";
  if (/^https?:\/\//i.test(base)) return base.replace(/\/+$/, "");
  return new URL(base, req.nextUrl.origin).toString().replace(/\/+$/, "");
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

async function fetchCompanyById(req: NextRequest, id: string) {
  const API = resolveApiUrl(req);
  const authorization = buildAuthHeader(req);
  const xReqId = req.headers.get("x-request-id");
  const xCorrId = req.headers.get("x-correlation-id");

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(authorization ? { Authorization: authorization } : {}),
    ...(xReqId ? { "x-request-id": xReqId } : {}),
    ...(xCorrId ? { "x-correlation-id": xCorrId } : {}),
  };

  const upstream = await fetch(`${API}/companies/${encodeURIComponent(id)}`, {
    method: "GET",
    headers,
    cache: "no-store",
  });

  const raw = await upstream.text();
  let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; } catch {
    return NextResponse.json({ error: "upstream_not_json", details: raw?.slice(0, 300) }, { status: 502 });
  }

  if (!upstream.ok || !data?.id) {
    const message = data?.error || data?.message || `companies_upstream_${upstream.status}`;
    return NextResponse.json({ error: message }, { status: upstream.status || 400 });
  }

  return NextResponse.json({ company: camelCompany(data) });
}

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json().catch(() => ({}));
    if (!id) return NextResponse.json({ error: "Missing 'id' in body" }, { status: 400 });
    return await fetchCompanyById(req, id);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal Server Error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const id = new URL(req.url).searchParams.get("id") ?? "";
    if (!id) return NextResponse.json({ error: "Missing 'id' query param" }, { status: 400 });
    return await fetchCompanyById(req, id);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal Server Error" }, { status: 500 });
  }
}
