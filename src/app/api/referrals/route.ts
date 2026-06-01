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
  const c = req.headers.get("cookie") ?? "";
  const read = (name: string) => {
    const m = c.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`, "i"));
    return m?.[1] ? decodeURIComponent(m[1]) : null;
  };

  const access = read("access_token") || read("sb-access-token");
  if (access && access.trim() !== "") return `Bearer ${access}`;

  const packed = read("supabase-auth-token");
  if (packed) {
    try {
      const parsed = JSON.parse(packed);
      if (Array.isArray(parsed) && typeof parsed[0] === "string" && parsed[0]) {
        return `Bearer ${parsed[0]}`;
      }
      if (parsed && typeof parsed === "object" && typeof (parsed as any).access_token === "string") {
        return `Bearer ${(parsed as any).access_token}`;
      }
    } catch { }
  }

  const h = req.headers.get("authorization");
  if (h && h.trim() !== "") return h;

  return undefined;
}


function resolveApiUrl(req: NextRequest) {
  const base =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_URL ||
    "https://cme-monolith-7hth.onrender.com";
  if (/^https?:\/\//i.test(base)) return base.replace(/\/$/, "");
  return new URL(base, req.nextUrl.origin).toString().replace(/\/$/, "");
}

async function readJson(res: Response) {
  const raw = await res.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    const e: any = new Error("upstream_not_json");
    e.__raw = raw?.slice(0, 800);
    e.status = res.status;
    throw e;
  }
  return { data, raw };
}

/* ========= NUEVO: GET /api/referrals ========= */
export async function GET(req: NextRequest) {
  try {
    const API = resolveApiUrl(req);
    const auth = buildAuthHeader(req);
    const cookie = req.headers.get("cookie") ?? "";

    const baseHeaders: HeadersInit = {
      Accept: "application/json",
      ...(auth ? { Authorization: auth } : {}),
      ...(cookie ? { cookie } : {}),
    };

    const sp = req.nextUrl.searchParams;
    const candidateId = sp.get("candidateId") ?? sp.get("candidate_id") ?? "";
    const headhunterId = sp.get("headhunterId") ?? sp.get("headhunter_id") ?? "";
    const jobOfferId = sp.get("jobOfferId") ?? sp.get("job_offer_id") ?? "";
    const limit = sp.get("limit") ?? "50";
    const offset = sp.get("offset") ?? "0";
    const status = sp.get("status") ?? "";
    const from = sp.get("from") ?? "";
    const to = sp.get("to") ?? "";
    const all = sp.get("all") ?? "";

    const qs = new URLSearchParams();
    if (candidateId) {
      qs.set("candidateId", candidateId);
      qs.set("candidate_id", candidateId);
    }
    if (headhunterId) {
      qs.set("headhunterId", headhunterId);
      qs.set("headhunter_id", headhunterId);
    }
    if (jobOfferId) {
      qs.set("jobOfferId", jobOfferId);
      qs.set("job_offer_id", jobOfferId);
    }
    if (status) qs.set("status", status);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (all) qs.set("all", all);
    qs.set("limit", String(limit));
    qs.set("offset", String(offset));

    let up = await fetch(`${API}/referrals?${qs.toString()}`, {
      method: "GET",
      headers: baseHeaders,
      cache: "no-store",
      credentials: "include",
    });

    if (up.status === 404) {
      // fallback por si el monolito expone otra convención
      up = await fetch(`${API}/referrals/list?${qs.toString()}`, {
        method: "GET",
        headers: baseHeaders,
        cache: "no-store",
        credentials: "include",
      });
    }

    const { data, raw } = await readJson(up);
    if (!up.ok) {
      const msg = data?.error || data?.message || `referrals_list_upstream_${up.status}`;
      return NextResponse.json({ error: msg, raw: data ?? raw }, { status: up.status || 500 });
    }

    const items: ReferralRow[] = Array.isArray(data)
      ? data
      : data?.items ?? data?.rows ?? data ?? [];
    const count: number =
      typeof data?.count === "number"
        ? data.count
        : typeof data?.total === "number"
          ? data.total
          : Array.isArray(items)
            ? items.length
            : 0;

    return NextResponse.json({ items, count }, { status: 200 });
  } catch (e: any) {
    const status = e?.status || 500;
    return NextResponse.json({ error: e?.message || "referrals_list_failed", raw: e?.__raw ?? null }, { status });
  }
}

/* ========= Ya existente: POST /api/referrals (crear) ========= */
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

    const payload = {
      headhunter_id: headhunterId,
      job_offer_id: jobOfferId,
      ...(candidateId ? { candidate_id: candidateId } : {}),
      headhunterId,
      jobOfferId,
      ...(candidateId ? { candidateId } : {}),
    };

    let up = await fetch(`${API}/referrals`, {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify(payload),
      cache: "no-store",
      credentials: "include",
    });

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
      return NextResponse.json({ error: msg, raw: data ?? raw, target: up.url }, { status });
    }

    const node: ReferralRow | any = data?.referral ?? data ?? {};
    const code = node?.referral_code ?? node?.code ?? node?.referralCode ?? null;
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
