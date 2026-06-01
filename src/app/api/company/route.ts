
import { NextRequest, NextResponse } from "next/server";
import {
  buildAuthHeader,
  resolveApiUrl,
  readJsonStrict,
} from "@/app/api/_utils/proxy-helpers";

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

  let data: any;

  try {
    const parsed = await readJsonStrict(upstream);
    data = parsed.data;
  } catch (err: any) {
    return NextResponse.json(
      {
        error: "upstream_not_json",
        details: err?.raw ?? null,
      },
      {
        status: 502,
      }
    );
  }

  if (!upstream.ok || !data?.id) {
    const message =
      data?.error ||
      data?.message ||
      `companies_upstream_${upstream.status}`;

    return NextResponse.json(
      { error: message },
      { status: upstream.status || 400 }
    );
  }

  return NextResponse.json({
    company: camelCompany(data),
  });
}

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json().catch(() => ({}));

    if (!id) {
      return NextResponse.json(
        { error: "Missing 'id' in body" },
        { status: 400 }
      );
    }

    return await fetchCompanyById(req, id);
  } catch (err: any) {
    return NextResponse.json(
      {
        error: err?.message || "Internal Server Error",
      },
      {
        status: 500,
      }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const id = new URL(req.url).searchParams.get("id") ?? "";

    if (!id) {
      return NextResponse.json(
        { error: "Missing 'id' query param" },
        { status: 400 }
      );
    }

    return await fetchCompanyById(req, id);
  } catch (err: any) {
    return NextResponse.json(
      {
        error: err?.message || "Internal Server Error",
      },
      {
        status: 500,
      }
    );
  }
}

