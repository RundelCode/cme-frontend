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

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const adminId = url.searchParams.get("id");

    if (!adminId) {
      return NextResponse.json(
        { error: "Missing ?id parameter" },
        { status: 400 }
      );
    }

    const API = resolveApiUrl(req);
    const target = `${ API } /companies/by - admin / ${ encodeURIComponent(adminId) } `;

    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    const auth = buildAuthHeader(req);

    if (auth) {
      headers.Authorization = auth;
    }

    const upstream = await fetch(target, {
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
          raw: err?.raw ?? null,
          target,
        },
        {
          status: 502,
        }
      );
    }

    if (!upstream.ok) {
      return NextResponse.json(
        {
          error: `upstream_${ upstream.status } `,
          raw: data,
          target,
        },
        {
          status: upstream.status || 502,
        }
      );
    }

    return NextResponse.json(
      Array.isArray(data)
        ? data.map(camelCompany)
        : Array.isArray(data?.items)
          ? data.items.map(camelCompany)
          : camelCompany(data)
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        error: err?.message || "internal_error",
      },
      {
        status: 500,
      }
    );
  }
}

