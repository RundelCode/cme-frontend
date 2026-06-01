// src/app/api/finance/users/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

type Payment = {
  id: string;
  job_offer_id?: string | null;
  headhunter_id?: string | null;
  company_id?: string | null;
  amount?: number | string;
  currency?: string;
  direction?: "in" | "out" | null | string;
  psp_payment_id?: string | null;
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

async function readUpstream(res: Response) {
  const text = await res.text().catch(() => "");
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* keep text for debug */ }
  return { ok: res.ok, status: res.status, data, text, url: res.url };
}

/** Convierte cualquier from/to entrante (ISO o ms) a epoch ms (string) */
function getEpochFromTo(url: URL): { from?: string; to?: string } {
  const rawFrom = url.searchParams.get("from");
  const rawTo = url.searchParams.get("to");

  const toMs = (v: string | null): string | undefined => {
    if (!v) return undefined;
    if (/^\d{10,}$/.test(v)) return v; // ya es ms
    const t = Date.parse(v);
    if (!Number.isNaN(t)) return String(t);
    return undefined;
  };

  const from = toMs(rawFrom);
  const to = toMs(rawTo);
  return { ...(from ? { from } : {}), ...(to ? { to } : {}) };
}

function normalizePayments(payload: any): { total: number; items: Payment[] } {
  if (Array.isArray(payload)) return { total: payload.length, items: payload };
  const items: Payment[] = payload?.items ?? payload?.rows ?? payload ?? [];
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
  const debugEnabled =
    req.headers.get("x-debug") === "1" || new URL(req.url).searchParams.get("debug") === "1";
  const debug: any = { step: 'start' };

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

    // 1) Validar usuario actual (auth)
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
        const payload = { total: 0, items: [], error: meParsed.data?.message || meParsed.data?.error || "No autenticado" };
        if (debugEnabled) (payload as any).debug = { ...debug, me: meParsed };
        return NextResponse.json(payload, { status });
      }
    }
    if (debugEnabled) debug.me = { status: meParsed.status, url: meParsed.url };

    // 2) Query ONLY con campos permitidos por QueryPaymentsDto
    const outQs = new URLSearchParams();

    // Forzamos listMine del controller:
    outQs.set("mine", "true");

    // Paginación opcional
    const limit = url.searchParams.get("limit");
    const offset = url.searchParams.get("offset");
    if (limit) outQs.set("limit", limit);
    if (offset) outQs.set("offset", offset);

    // Estado/dirección opcionales (permitidos por DTO)
    const status = url.searchParams.get("status");
    const direction = url.searchParams.get("direction");
    if (status) outQs.set("status", status);
    if (direction) outQs.set("direction", direction);

    // Fechas: convertimos a EPOCH MS porque el servicio espera números
    const { from, to } = getEpochFromTo(url);
    if (from) outQs.set("from", from);
    if (to) outQs.set("to", to);

    // 3) Fallback de endpoints del monolito
    const targets = [
      `${API}/payments?${outQs.toString()}`,
      `${API}/finance/payments?${outQs.toString()}`,
      `${API}/payments/user?${outQs.toString()}`,
    ];
    if (debugEnabled) debug.targets = targets;

    let upstreamOk = false;
    let upstreamPayload: any = null;
    let upstreamStatus = 502;
    let lastText: string | undefined;
    let usedTarget: string | undefined;

    for (const target of targets) {
      const res = await fetch(target, {
        method: "GET",
        headers: baseHeaders,
        cache: "no-store",
        credentials: "include",
      });
      const parsed = await readUpstream(res);
      if (parsed.ok) {
        upstreamOk = true;
        upstreamStatus = parsed.status;
        upstreamPayload = parsed.data ?? parsed.text;
        usedTarget = parsed.url;
        break;
      } else {
        upstreamStatus = parsed.status;
        lastText = typeof parsed.data === "object" ? JSON.stringify(parsed.data) : parsed.text;
      }
    }

    if (!upstreamOk) {
      const msg =
        (upstreamPayload && typeof upstreamPayload === "object" && (upstreamPayload.message || upstreamPayload.error)) ||
        `payments_upstream_${upstreamStatus}`;
      const payload: any = { total: 0, items: [], error: msg, raw: lastText?.slice(0, 800) ?? null };
      if (debugEnabled) payload.debug = { ...debug, usedTarget, upstreamStatus, lastText: lastText?.slice(0, 800) };
      return NextResponse.json(payload, { status: upstreamStatus || 500 });
    }

    // 4) Normaliza salida del monolito
    const normalized = normalizePayments(upstreamPayload);
    const items: Payment[] = (normalized.items || []).map((p: any) => ({
      id: p?.id,
      job_offer_id: p?.job_offer_id ?? p?.jobOfferId ?? null,
      headhunter_id: p?.headhunter_id ?? p?.headhunterId ?? null,
      company_id: p?.company_id ?? p?.companyId ?? null,
      amount: p?.amount,
      currency: p?.currency ?? "USD",
      direction: (p?.direction ?? null) as any,
      psp_payment_id: p?.psp_payment_id ?? p?.pspPaymentId ?? null,
      status: p?.status,
      created_at: p?.created_at ?? p?.createdAt,
      updated_at: p?.updated_at ?? p?.updatedAt ?? null,
    }));

    const payload: any = { total: normalized.total, items };
    if (debugEnabled) payload.debug = { ...debug, usedTarget, upstreamStatus };
    return NextResponse.json(payload, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || "finance_users_proxy_error";
    const isAuth = /unauthorized|forbidden|token|auth/i.test(msg);
    const payload: any = { total: 0, items: [], error: msg };
    if (debugEnabled) payload.debug = { ...debug, exception: { message: e?.message, stack: e?.stack?.split('\n').slice(0, 5) } };
    return NextResponse.json(payload, { status: isAuth ? 401 : e?.status || 500 });
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}
