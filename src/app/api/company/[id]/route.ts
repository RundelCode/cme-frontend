import { NextRequest, NextResponse } from "next/server";
import {
  buildAuthHeader,
  resolveApiUrl,
  readJsonStrict,
} from "@/app/api/_utils/proxy-helpers";

function normalizeOptional(v: any) {
  if (v === "") return null;
  return v;
}

async function readJson(res: Response) {
  const { data, raw } = await readJsonStrict(res);
  return { data, raw };
}

export async function GET(req: NextRequest, context: any) {
  try {
    const id = context?.params?.id;

    if (!id) {
      return NextResponse.json(
        { error: "missing_id" },
        { status: 400 }
      );
    }

    const API = resolveApiUrl(req);
    const authorization = buildAuthHeader(req);
    const cookie = req.headers.get("cookie") ?? "";

    const headers: HeadersInit = {
      Accept: "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
      ...(cookie ? { cookie } : {}),
    };

    const up = await fetch(
      `${API}/companies/${encodeURIComponent(id)}`,
      {
        method: "GET",
        headers,
        credentials: "include",
        cache: "no-store",
      }
    );

    const { data, raw } = await readJson(up);

    if (!up.ok) {
      const msg =
        data?.error ||
        data?.message ||
        `companies_upstream_${up.status}`;

      return NextResponse.json(
        {
          error: msg,
          raw: data ?? raw,
        },
        {
          status: up.status || 404,
        }
      );
    }

    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json(
      {
        error: e?.message || "companies_id_error",
        raw: e?.raw ?? null,
      },
      {
        status: e?.status || 500,
      }
    );
  }
}

export async function PATCH(req: NextRequest, context: any) {
  try {
    const id = context?.params?.id;

    if (!id) {
      return NextResponse.json(
        { error: "missing_id" },
        { status: 400 }
      );
    }

    const API = resolveApiUrl(req);
    const authorization = buildAuthHeader(req);
    const cookie = req.headers.get("cookie") ?? "";

    const headers: HeadersInit = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
      ...(cookie ? { cookie } : {}),
    };

    const body = await req.json().catch(() => ({}));

    const VALID_PLANS = [
      "free",
      "basic",
      "pro",
    ];

    const payload: Record<string, any> = {
      name: body?.name,
      email: body?.email,
      website: normalizeOptional(body?.website),
      description: normalizeOptional(body?.description),
      industry: normalizeOptional(body?.industry),
      location: normalizeOptional(body?.location),
      profilePicture: normalizeOptional(body?.profilePicture),
      coverPhoto: normalizeOptional(body?.coverPhoto),
      companyRating: body?.companyRating ?? undefined,
      subscriptionPlan: VALID_PLANS.includes(body?.subscriptionPlan)
        ? body.subscriptionPlan
        : "free",
      verifiedAt: normalizeOptional(body?.verifiedAt),
    };

    Object.keys(payload).forEach((k) => {
      if (payload[k] === undefined) {
        delete payload[k];
      }
    });

    payload.boolVerified =
      body?.boolVerified == null
        ? false
        : !!body.boolVerified;

    const up = await fetch(
      `${API}/companies/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify(payload),
        credentials: "include",
        cache: "no-store",
      }
    );

    const { data, raw } = await readJson(up);

    if (!up.ok) {
      const msg =
        data?.error ||
        data?.message ||
        `companies_patch_upstream_${up.status}`;

      return NextResponse.json(
        {
          error: msg,
          raw: data ?? raw,
        },
        {
          status: up.status || 502,
        }
      );
    }

    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json(
      {
        error: e?.message || "companies_patch_error",
        raw: e?.raw ?? null,
      },
      {
        status: e?.status || 500,
      }
    );
  }
}