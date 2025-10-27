import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function buildAuthHeader(req: Request): string | undefined {
  const fromHeader = req.headers.get("authorization");
  if (fromHeader && fromHeader.trim() !== "") return fromHeader;
  const cookieHeader = req.headers.get("cookie") ?? "";
  const m = cookieHeader.match(/(?:^|;\s*)access_token=([^;]+)/i);
  if (m?.[1]) return `Bearer ${decodeURIComponent(m[1])}`;
  return undefined;
}

function resolveApiUrl(reqUrl: string) {
  const base =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_URL ||
    "http://localhost:3000/api";
  try {
    new URL(base);
    return base.replace(/\/$/, "");
  } catch {
    const u = new URL(reqUrl);
    return new URL(base, u.origin).toString().replace(/\/$/, "");
  }
}

async function readJson(res: Response) {
  const raw = await res.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    const e: any = new Error("upstream_not_json");
    e.status = res.status;
    e.raw = raw?.slice(0, 600);
    throw e;
  }
  return { data, raw };
}

function coerceCompanyNumberFields(company: any) {
  if (company?.companyRating != null) {
    const n = Number(company.companyRating);
    company.companyRating = Number.isFinite(n) ? n : null;
  }
  return company;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const params =
      "then" in ctx.params
        ? await (ctx.params as Promise<{ id: string }>)
        : (ctx.params as { id: string });

    const { id } = params;
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

    const API = resolveApiUrl(req.url);
    const authorization = buildAuthHeader(req);
    const cookie = req.headers.get("cookie") ?? "";
    const xReqId = req.headers.get("x-request-id") || "";
    const xCorrId = req.headers.get("x-correlation-id") || "";

    const headers: HeadersInit = {
      Accept: "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
      ...(cookie ? { cookie } : {}),
      ...(xReqId ? { "x-request-id": xReqId } : {}),
      ...(xCorrId ? { "x-correlation-id": xCorrId } : {}),
    };

    const up = await fetch(`${API}/companies/${encodeURIComponent(id)}`, {
      method: "GET",
      headers,
      credentials: "include",
      cache: "no-store",
    });

    const { data, raw } = await readJson(up);

    if (!up.ok) {
      const msg = data?.error || data?.message || `companies_upstream_${up.status}`;
      return NextResponse.json({ error: msg, raw: data ?? raw }, { status: up.status || 404 });
    }

    const company = coerceCompanyNumberFields(data?.company ?? data ?? null);
    if (!company?.id) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ company });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "companies_id_error", raw: e?.raw ?? null },
      { status: e?.status || 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const params =
      "then" in ctx.params
        ? await (ctx.params as Promise<{ id: string }>)
        : (ctx.params as { id: string });
    const { id } = params;
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

    const API = resolveApiUrl(req.url);
    const authorization = buildAuthHeader(req);
    const cookie = req.headers.get("cookie") ?? "";
    const xReqId = req.headers.get("x-request-id") || "";
    const xCorrId = req.headers.get("x-correlation-id") || "";

    const payload = await req.json().catch(() => ({}));

    const headers: HeadersInit = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
      ...(cookie ? { cookie } : {}),
      ...(xReqId ? { "x-request-id": xReqId } : {}),
      ...(xCorrId ? { "x-correlation-id": xCorrId } : {}),
    };

    const up = await fetch(`${API}/companies/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(payload || {}),
      credentials: "include",
      cache: "no-store",
    });

    const { data, raw } = await readJson(up);

    if (!up.ok) {
      const msg =
        data?.error || data?.message || `companies_patch_upstream_${up.status}`;
      return NextResponse.json(
        { error: msg, raw: data ?? raw },
        { status: up.status || 502 }
      );
    }

    const company = coerceCompanyNumberFields(data?.company ?? data ?? null);
    return NextResponse.json({ company });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "companies_patch_error", raw: e?.raw ?? null },
      { status: e?.status || 500 }
    );
  }
}
