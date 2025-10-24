import { NextRequest, NextResponse } from "next/server";
import { CREATE_REFERRAL } from "../../../../lib/queries";

/** Resuelve el endpoint GQL desde env o como ruta relativa */
function resolveGraphqlUrl(req: NextRequest) {
  const env =
    process.env.GRAPHQL_URL ||
    process.env.NEXT_PUBLIC_GRAPHQL_URL ||
    "/api/graphql";
  return env.startsWith("/")
    ? new URL(env, req.nextUrl.origin).toString()
    : env;
}

/** Extrae access token de Authorization o cookies (incluye supabase-auth-token JSON) */
function extractAccessToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const t = auth.slice("bearer ".length).trim();
    if (t) return t;
  }
  const cookie = req.headers.get("cookie") ?? "";

  // sb-access-token / access_token directos
  const m1 = cookie.match(/(?:^|;\s*)sb-access-token=([^;]+)/i);
  if (m1?.[1]) return decodeURIComponent(m1[1]);

  const m2 = cookie.match(/(?:^|;\s*)access_token=([^;]+)/i);
  if (m2?.[1]) return decodeURIComponent(m2[1]);

  // supabase-auth-token (JSON con access_token)
  const m3 = cookie.match(/(?:^|;\s*)supabase-auth-token=([^;]+)/i);
  if (m3?.[1]) {
    try {
      const val = decodeURIComponent(m3[1]);
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed) && typeof parsed[0] === "string" && parsed[0]) {
        return parsed[0]; // ["access_token", ...] (formato viejo)
      }
      if (parsed && typeof parsed === "object" && typeof parsed.access_token === "string") {
        return parsed.access_token;
      }
    } catch { /* noop */ }
  }
  return null;
}

/** Decodifica JWT (sin verificar) y saca id del payload */
function decodeUserIdFromJwt(token: string | null): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    // Buffer solo existe en runtime Node. En Edge podrías usar atob/Uint8Array, pero este route es Node por defecto.
    const json = Buffer
      .from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64")
      .toString("utf8");
    const payload = JSON.parse(json);
    return (
      (typeof payload?.sub === "string" && payload.sub) ||
      (typeof payload?.user_id === "string" && payload.user_id) ||
      (typeof payload?.id === "string" && payload.id) ||
      null
    );
  } catch {
    return null;
  }
}

/** Fallback 1: pide /api/me y usa user.id | authMe.id | me.id */
async function getUserIdFromMe(req: NextRequest): Promise<string | null> {
  try {
    const meUrl = new URL("/api/me", req.nextUrl.origin).toString();
    const r = await fetch(meUrl, {
      method: "GET",
      headers: {
        accept: "application/json",
        ...(req.headers.get("cookie") ? { cookie: req.headers.get("cookie")! } : {}),
        ...(req.headers.get("authorization")
          ? { authorization: req.headers.get("authorization")! }
          : {}),
      },
      cache: "no-store",
    });
    const j = await r.json().catch(() => ({}));
    const id = j?.user?.id || j?.authMe?.id || j?.me?.id || null;
    return typeof id === "string" ? id : null;
  } catch {
    return null;
  }
}

/** Fallback 2: AUTH_ME contra GraphQL */
async function getUserIdFromGraphql(req: NextRequest): Promise<string | null> {
  const url = resolveGraphqlUrl(req);
  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
    };
    const auth = req.headers.get("authorization");
    const cookie = req.headers.get("cookie");
    if (auth) headers["authorization"] = auth;
    if (cookie) headers["cookie"] = cookie;

    const query = `query { authMe { id } }`;
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ query }),
      cache: "no-store",
    });
    const raw = await resp.text();
    let data: any = null;
    try { data = JSON.parse(raw); } catch { }
    const id = data?.data?.authMe?.id || null;
    return typeof id === "string" ? id : null;
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

    // --- Resolver headhunterId de forma robusta (me -> gql -> jwt) ---
    let headhunterId: string | null = await getUserIdFromMe(req);
    if (!headhunterId) headhunterId = await getUserIdFromGraphql(req);
    if (!headhunterId) {
      const token = extractAccessToken(req);
      headhunterId = decodeUserIdFromJwt(token);
    }
    if (!headhunterId) {
      return NextResponse.json(
        { error: "unauthenticated_no_user_id" },
        { status: 401 }
      );
    }

    // --- Armar request a GraphQL ---
    const url = resolveGraphqlUrl(req);
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

    const variables: Record<string, any> = {
      headhunterId,
      jobOfferId,
    };
    if (candidateId !== undefined) variables.candidateId = candidateId;

    // LOGS útiles (no sensibles)
    console.log("[/api/referrals] createReferral ->", {
      gql: url,
      headhunterId,
      jobOfferId,
      hasCandidateId: candidateId != null,
    });

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
    try { data = JSON.parse(raw); } catch { }

    if (!gqlRes.ok) {
      return NextResponse.json(
        { error: `GraphQL HTTP ${gqlRes.status}`, details: data?.errors ?? null, raw: data ?? raw, target: url },
        { status: 502 }
      );
    }

    if (data?.errors?.length) {
      const msg = data.errors[0]?.message || "GraphQL error";
      return NextResponse.json(
        { error: msg, details: data.errors, target: url },
        { status: /conflict|23505/i.test(msg) ? 409 : 500 }
      );
    }

    const node = data?.data?.createReferral;
    const code = node?.referral_code ?? node?.code ?? null;
    if (!code) {
      return NextResponse.json({ error: "missing_referral_code", raw: data }, { status: 500 });
    }

    return NextResponse.json({ code, id: node?.id ?? null }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "referral_create_failed";
    const status =
      /unauth|forbidden|no_user_id/i.test(msg) ? 401 :
        /conflict|23505/i.test(msg) ? 409 :
          500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}
