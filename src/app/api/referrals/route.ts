// apps/web/app/api/referrals/route.ts
import { NextRequest, NextResponse } from "next/server";
import { CREATE_REFERRAL } from "../../../../lib/queries";

/** Igual a tu patrón: resuelve el endpoint GQL desde env o como ruta relativa */
function resolveGraphqlUrl(req: NextRequest) {
  const env =
    process.env.GRAPHQL_URL ||
    process.env.NEXT_PUBLIC_GRAPHQL_URL ||
    "/api/graphql";

  if (env.startsWith("/")) {
    return new URL(env, req.nextUrl.origin).toString();
  }
  return env;
}

/** Extrae el access token desde Authorization o cookies (supabase suele poner sb-access-token) */
function getAccessToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice("bearer ".length).trim();
  }
  const cookie = req.headers.get("cookie") ?? "";
  // nombres comunes
  const m1 = cookie.match(/(?:^|;\s*)sb-access-token=([^;]+)/);
  const m2 = cookie.match(/(?:^|;\s*)access_token=([^;]+)/);
  return decodeURIComponent(m1?.[1] || m2?.[1] || "");
}

/** Decodifica un JWT sin verificar firma (solo para leer el payload y obtener sub) */
function decodeJwtSub(token: string | null): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    );
    return typeof payload?.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { jobOfferId, candidateId } = await req.json().catch(() => ({} as any));

    if (!jobOfferId) {
      return NextResponse.json({ error: "jobOfferId_required" }, { status: 400 });
    }

    const url = resolveGraphqlUrl(req);

    // Reenviamos headers relevantes como en tu handler ejemplo
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
    };
    const auth = req.headers.get("authorization");
    const cookie = req.headers.get("cookie");
    const xReqId = req.headers.get("x-request-id");
    const xCorrId = req.headers.get("x-correlation-id");
    if (auth) headers["authorization"] = auth;
    if (cookie) headers["cookie"] = cookie;
    if (xReqId) headers["x-request-id"] = xReqId;
    if (xCorrId) headers["x-correlation-id"] = xCorrId;

    const token = getAccessToken(req);
    if (!token) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const headhunterId = decodeJwtSub(token);

    const variables: Record<string, any> = {
      jobOfferId,
      headhunterId,
    };
    if (candidateId !== undefined) variables.candidateId = candidateId;

    const gqlRes = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: CREATE_REFERRAL,
        variables,
        operationName: "CreateReferral",
      }),
      cache: "no-store",
    });

    const raw = await gqlRes.text();
    let data: any = null;
    try { data = JSON.parse(raw); } catch {}

    if (!gqlRes.ok) {
      return NextResponse.json(
        {
          error: `GraphQL HTTP ${gqlRes.status}`,
          details: data?.errors ?? null,
          raw: data ?? raw,
          target: url,
        },
        { status: 502 },
      );
    }

    if (data?.errors?.length) {
      return NextResponse.json(
        {
          error: data.errors[0]?.message ?? "GraphQL error",
          details: data.errors,
          target: url,
        },
        { status: 500 },
      );
    }

    const node = data?.data?.createReferral;
    if (!node?.referral_code) {
      return NextResponse.json(
        { error: "missing_referral_code", raw: data },
        { status: 500 },
      );
    }

    return NextResponse.json({ code: node.referral_code, id: node.id }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "referral_create_failed";
    const status =
      /unauth|forbidden/i.test(msg) ? 401 :
      /conflict|23505/i.test(msg) ? 409 :
      500;
    return NextResponse.json({ error: msg }, { status });
  }
}
