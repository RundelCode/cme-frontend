// src/app/api/referrals/route.ts
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type ReferralRow = {
  id: string;
  headhunter_id?: string | null;
  candidate_id?: string | null;
  job_offer_id: string;
  referral_code: string;
  status?: string;
  created_at?: string;
  updated_at?: string | null;
};

function buildAuthHeader(req: NextRequest): string | undefined {
  const h = req.headers.get("authorization");
  if (h && h.trim() !== "") return h;
  const token = req.cookies.get("access_token")?.value;
  if (token && token.trim() !== "") return `Bearer ${token}`;
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(/(?:^|;\s*)access_token=([^;]+)/i);
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

function extractAccessToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const t = auth.slice(7).trim();
    if (t) return t;
  }
  const cookie = req.headers.get("cookie") ?? "";
  const m1 = cookie.match(/(?:^|;\s*)sb-access-token=([^;]+)/i);
  if (m1?.[1]) return decodeURIComponent(m1[1]);
  const m2 = cookie.match(/(?:^|;\s*)access_token=([^;]+)/i);
  if (m2?.[1]) return decodeURIComponent(m2[1]);
  const m3 = cookie.match(/(?:^|;\s*)supabase-auth-token=([^;]+)/i);
  if (m3?.[1]) {
    try {
      const val = decodeURIComponent(m3[1]);
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed) && typeof parsed[0] === "string" && parsed[0]) return parsed[0];
      if (parsed && typeof parsed === "object" && typeof (parsed as any).access_token === "string") {
        return (parsed as any).access_token as string;
      }
    } catch { }
  }
  return null;
}

function base64UrlDecode(s: string): string {
  try {
    // Node
    return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    // Edge runtime fallback
    const pad = s.length % 4 ? s + "=".repeat(4 - (s.length % 4)) : s;
    const str = atob(pad.replace(/-/g, "+").replace(/_/g, "/"));
    // decode UTF-8
    const esc = str.replace(/%/g, "%25").replace(/[\x00-\x7F]/g, (c) =>
      "%" + c.charCodeAt(0).toString(16).padStart(2, "0")
    );
    return decodeURIComponent(esc);
  }
}

function decodeUserIdFromJwt(token: string | null): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const json = base64UrlDecode(parts[1]);
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

async function readJson(res: Response) {
  const raw = await res.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    const e: any = new Error("upstream_not_json");
    e.__raw = raw?.slice(0, 600);
    e.status = res.status;
    throw e;
  }
  return { data, raw };
}

// Crea un referral
export async function POST(req: NextRequest) {
  try {
    const { jobOfferId, candidateId } = (await req.json().catch(() => ({}))) as {
      jobOfferId?: string;
      candidateId?: string;
    };

    if (!jobOfferId) {
      return NextResponse.json({ error: "jobOfferId_required" }, { status: 400 });
    }

    const API = resolveApiUrl(req);
    const auth = buildAuthHeader(req);
    const cookie = req.headers.get("cookie") ?? "";
    const xReqId = req.headers.get("x-request-id");
    const xCorrId = req.headers.get("x-correlation-id");

    const baseHeaders: HeadersInit = {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
      ...(cookie ? { cookie } : {}),
      ...(xReqId ? { "x-request-id": xReqId } : {}),
      ...(xCorrId ? { "x-correlation-id": xCorrId } : {}),
    };

    // 1) headhunterId desde /auth/me, fallback JWT
    let headhunterId: string | null = null;
    try {
      const meRes = await fetch(`${API}/auth/me`, {
        method: "GET",
        headers: baseHeaders,
        cache: "no-store",
        credentials: "include",
      });
      const { data: me } = await readJson(meRes);
      if (meRes.ok) {
        headhunterId = String(me?.id || me?.user?.id || "");
        if (!headhunterId) headhunterId = null;
      }
    } catch { }

    if (!headhunterId) {
      headhunterId = decodeUserIdFromJwt(extractAccessToken(req));
    }
    if (!headhunterId) {
      return NextResponse.json({ error: "unauthenticated_no_user_id" }, { status: 401 });
    }

    // 2) Payload con ambos formatos (snake y camel) para máxima compatibilidad
    const payload = {
      headhunter_id: headhunterId,
      job_offer_id: jobOfferId,
      ...(candidateId ? { candidate_id: candidateId } : {}),

      headhunterId,
      jobOfferId,
      ...(candidateId ? { candidateId } : {}),
    };

    // 3) Intento 1: POST /referrals
    let up = await fetch(`${API}/referrals`, {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify(payload),
      cache: "no-store",
      credentials: "include",
    });

    // Fallback: algunos backends exponen /referrals/create
    if (up.status === 404 || up.status === 405) {
      up = await fetch(`${API}/referrals/create`, {
        method: "POST",
        headers: baseHeaders,
        body: JSON.stringify(payload),
        cache: "no-store",
        credentials: "include",
      });
    }

    const { data, raw } = await readJson(up);

    if (!up.ok) {
      const msg = data?.error || data?.message || `referrals_upstream_${up.status}`;
      const status = /conflict|already|23505/i.test(String(msg)) ? 409 : up.status || 500;
      return NextResponse.json(
        { error: msg, raw: data ?? raw, target: up.url },
        { status }
      );
    }

    // 4) Normaliza respuesta
    const node: ReferralRow | any = data?.referral ?? data ?? {};
    const code =
      node?.referral_code ?? node?.code ?? node?.referralCode ?? null;
    const id = node?.id ?? null;

    const normalized = {
      id,
      code,
      referral: {
        id: node?.id ?? null,
        referral_code: code,
        headhunter_id: node?.headhunter_id ?? node?.headhunterId ?? headhunterId ?? null,
        candidate_id: node?.candidate_id ?? node?.candidateId ?? candidateId ?? null,
        job_offer_id: node?.job_offer_id ?? node?.jobOfferId ?? jobOfferId,
        status: node?.status ?? null,
        created_at: node?.created_at ?? node?.createdAt ?? null,
        updated_at: node?.updated_at ?? node?.updatedAt ?? null,
      } as ReferralRow,
    };

    if (!code) {
      return NextResponse.json({ error: "missing_referral_code", raw: data }, { status: 502 });
    }

    return NextResponse.json(normalized, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "referral_create_failed";
    const status =
      /unauth|forbidden|no_user_id/i.test(msg) ? 401 :
        /conflict|already|23505/i.test(msg) ? 409 :
          e?.status || 500;
    return NextResponse.json({ error: msg, __raw: e?.__raw ?? null }, { status });
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}
