// src/app/api/finance/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function buildAuthHeader(req: NextRequest): string | undefined {
  const fromHeader = req.headers.get("authorization");
  if (fromHeader && fromHeader.trim() !== "") return fromHeader;
  const token = req.cookies.get("access_token")?.value;
  if (token && token.trim() !== "") return `Bearer ${token}`;
  const cookieHeader = req.headers.get("cookie") ?? "";
  const m = cookieHeader.match(/(?:^|;\s*)access_token=([^;]+)/i);
  if (m?.[1]) return `Bearer ${decodeURIComponent(m[1])}`;
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

async function readUpstream(res: Response) {
  const text = await res.text().catch(() => "");
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { }
  return { ok: res.ok, status: res.status, data, text, url: res.url };
}

function getEpochFromTo(url: URL): { from?: string; to?: string } {
  const rawFrom = url.searchParams.get("from");
  const rawTo = url.searchParams.get("to");
  const toMs = (v: string | null): string | undefined => {
    if (!v) return undefined;
    if (/^\d{10,}$/.test(v)) return v;
    const t = Date.parse(v);
    if (!Number.isNaN(t)) return String(t);
    return undefined;
  };
  const from = toMs(rawFrom);
  const to = toMs(rawTo);
  return { ...(from ? { from } : {}), ...(to ? { to } : {}) };
}

function normalizePayments(payload: any) {
  if (Array.isArray(payload)) return { total: payload.length, items: payload };
  const items = payload?.items ?? payload?.rows ?? payload ?? [];
  const total =
    typeof payload?.total === "number"
      ? payload.total
      : typeof payload?.count === "number"
        ? payload.count
        : Array.isArray(items)
          ? items.length
          : 0;
  return { total, items };
}

export async function GET(req: NextRequest) {
  const debugOn = req.headers.get("x-debug") === "1" || new URL(req.url).searchParams.get("debug") === "1";
  const debug: Record<string, any> = {};
  try {
    const API = resolveApiUrl(req);
    const url = new URL(req.url);

    const authorization = buildAuthHeader(req);
    const cookie = req.headers.get("cookie") ?? "";

    const baseHeaders: HeadersInit = {
      Accept: "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
      ...(cookie ? { cookie } : {}),
    };

    let meRes = await fetch(`${API}/auth/me`, {
      method: "GET",
      headers: baseHeaders,
      cache: "no-store",
      credentials: "include",
    });
    let meParsed = await readUpstream(meRes);
    if (!meParsed.ok) {
      const alt = await fetch(`${API}/profiles/me`, {
        method: "GET",
        headers: baseHeaders,
        cache: "no-store",
        credentials: "include",
      });
      meParsed = await readUpstream(alt);
      if (!meParsed.ok) {
        const status = meParsed.status === 401 ? 401 : 500;
        return NextResponse.json(
          { total: 0, items: [], error: meParsed.data?.message || meParsed.data?.error || "No autenticado", ...(debugOn ? { debug: { me: meParsed } } : {}) },
          { status }
        );
      }
    }

    const userId: string | undefined = meParsed.data?.id;
    if (!userId) {
      return NextResponse.json(
        { total: 0, items: [], error: "No autenticado (sin userId)" },
        { status: 401 }
      );
    }

    const companyTargets = [
      `${API}/companies/by-admin/${encodeURIComponent(userId)}`,
      `${API}/companies/search?adminId=${encodeURIComponent(userId)}&limit=1`,
    ];
    let companyPayload: any = null;
    for (const t of companyTargets) {
      const r = await fetch(t, { method: "GET", headers: baseHeaders, cache: "no-store", credentials: "include" });
      const parsed = await readUpstream(r);
      if (debugOn) debug.companyAttempt = { url: t, status: parsed.status, ok: parsed.ok };
      if (parsed.ok) {
        companyPayload = parsed.data ?? parsed.text;
        break;
      }
    }

    let companyId: string | undefined;
    if (companyPayload) {
      if (companyPayload?.id) companyId = String(companyPayload.id);
      else if (Array.isArray(companyPayload?.items) && companyPayload.items[0]?.id) companyId = String(companyPayload.items[0].id);
      else if (Array.isArray(companyPayload) && companyPayload[0]?.id) companyId = String(companyPayload[0].id);
    }

    if (!companyId) {
      return NextResponse.json(
        { total: 0, items: [], note: "No se encontró empresa para este admin", ...(debugOn ? { debug } : {}) },
        { status: 200 }
      );
    }

    const outQs = new URLSearchParams();
    outQs.set("companyId", companyId);

    const limit = url.searchParams.get("limit");
    const offset = url.searchParams.get("offset");
    const status = url.searchParams.get("status");
    const direction = url.searchParams.get("direction");
    if (limit) outQs.set("limit", limit);
    if (offset) outQs.set("offset", offset);
    if (status) outQs.set("status", status);
    if (direction) outQs.set("direction", direction);

    const { from, to } = getEpochFromTo(url);
    if (from) outQs.set("from", from);
    if (to) outQs.set("to", to);

    const targets = [
      `${API}/payments?${outQs.toString()}`,
      `${API}/finance/payments?${outQs.toString()}`,
      `${API}/payments/company?${outQs.toString()}`,
    ];

    let upstreamOk = false;
    let upstreamPayload: any = null;
    let upstreamStatus = 502;
    let lastParsed: any = null;

    for (const t of targets) {
      const r = await fetch(t, { method: "GET", headers: baseHeaders, cache: "no-store", credentials: "include" });
      const parsed = await readUpstream(r);
      if (debugOn) debug.paymentsAttempt = { urlTried: t, status: parsed.status, ok: parsed.ok, snippet: typeof parsed.data === "object" ? undefined : parsed.text?.slice(0, 300) };
      if (parsed.ok) {
        upstreamOk = true;
        upstreamStatus = parsed.status;
        upstreamPayload = parsed.data ?? parsed.text;
        break;
      } else {
        upstreamStatus = parsed.status;
        lastParsed = parsed;
      }
    }

    if (!upstreamOk) {
      const msg =
        (lastParsed?.data && typeof lastParsed.data === "object" && (lastParsed.data.message || lastParsed.data.error)) ||
        `payments_upstream_${upstreamStatus}`;
      return NextResponse.json(
        { total: 0, items: [], error: msg, ...(debugOn ? { debug: { ...debug, last: { status: upstreamStatus, url: lastParsed?.url, body: lastParsed?.text?.slice(0, 600) } } } : {}) },
        { status: upstreamStatus || 500 }
      );
    }

    const normalized = normalizePayments(upstreamPayload);
    const items = (normalized.items || []).map((p: any) => ({
      id: p?.id,
      job_offer_id: p?.job_offer_id ?? p?.jobOfferId ?? null,
      headhunter_id: p?.headhunter_id ?? p?.headhunterId ?? null,
      company_id: p?.company_id ?? p?.companyId ?? null,
      amount: typeof p?.amount === "string" ? Number(p.amount) : p?.amount,
      currency: p?.currency ?? "USD",
      direction: (p?.direction ?? null) as any,
      psp_payment_id: p?.psp_payment_id ?? p?.pspPaymentId ?? null,
      status: p?.status,
      created_at: p?.created_at ?? p?.createdAt,
      updated_at: p?.updated_at ?? p?.updatedAt ?? null,
    }));

    return NextResponse.json(
      { total: normalized.total, items, ...(debugOn ? { debug } : {}) },
      { status: 200 }
    );
  } catch (e: any) {
    const msg = e?.message || "finance_proxy_error";
    const isAuth = /unauthorized|forbidden|token|auth/i.test(msg);
    return NextResponse.json(
      { total: 0, items: [], error: msg, ...(debugOn ? { debug: { error: msg } } : {}) },
      { status: isAuth ? 401 : e?.status || 500 }
    );
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}
