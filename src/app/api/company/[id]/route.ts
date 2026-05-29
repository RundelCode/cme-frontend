import { NextRequest, NextResponse } from 'next/server';

function buildAuthHeader(req: NextRequest): string | undefined {
  const fromHeader = req.headers.get('authorization');
  if (fromHeader && fromHeader.trim() !== '') return fromHeader;
  const cookieHeader = req.headers.get('cookie') ?? '';
  const m = cookieHeader.match(/(?:^|;\s*)access_token=([^;]+)/i);
  if (m?.[1]) return `Bearer ${decodeURIComponent(m[1])}`;
  return undefined;
}

function resolveApiUrl(reqUrl: string) {
  const base =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_URL ||
    'http://localhost:3000/api';
  try {
    new URL(base);
    return base.replace(/\/$/, '');
  } catch {
    const u = new URL(reqUrl);
    return new URL(base, u.origin).toString().replace(/\/$/, '');
  }
}

async function readJson(res: Response) {
  const raw = await res.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    const e: any = new Error('upstream_not_json');
    e.status = res.status;
    e.raw = raw?.slice(0, 800);
    throw e;
  }
  return { data, raw };
}

function normalizeOptional(v: any) {
  if (v === '') return null;
  return v;
}

export async function GET(req: NextRequest, context: any) {
  try {
    const id = context?.params?.id;
    if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 });

    const API = resolveApiUrl(req.url);
    const authorization = buildAuthHeader(req);
    const cookie = req.headers.get('cookie') ?? '';
    const headers: HeadersInit = {
      Accept: 'application/json',
      ...(authorization ? { Authorization: authorization } : {}),
      ...(cookie ? { cookie } : {}),
    };

    const up = await fetch(`${API}/companies/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers,
      credentials: 'include',
      cache: 'no-store',
    });

    const { data, raw } = await readJson(up);
    if (!up.ok) {
      const msg = data?.error || data?.message || `companies_upstream_${up.status}`;
      return NextResponse.json({ error: msg, raw: data ?? raw }, { status: up.status || 404 });
    }
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'companies_id_error', raw: e?.raw ?? null },
      { status: e?.status || 500 }
    );
  }
}

export async function PATCH(req: NextRequest, context: any) {
  try {
    const id = context?.params?.id;
    if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 });

    const API = resolveApiUrl(req.url);
    const authorization = buildAuthHeader(req);
    const cookie = req.headers.get('cookie') ?? '';
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(authorization ? { Authorization: authorization } : {}),
      ...(cookie ? { cookie } : {}),
    };

    const body = await req.json().catch(() => ({}));
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
      subscriptionPlan: body?.subscriptionPlan ?? 'free',
      verifiedAt: normalizeOptional(body?.verifiedAt),
    };

    Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
    payload.boolVerified = body?.boolVerified == null ? false : !!body.boolVerified;

    const up = await fetch(`${API}/companies/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(payload),
      credentials: 'include',
      cache: 'no-store',
    });

    const { data, raw } = await readJson(up);
    if (!up.ok) {
      const msg = data?.error || data?.message || `companies_patch_upstream_${up.status}`;
      return NextResponse.json({ error: msg, raw: data ?? raw }, { status: up.status || 502 });
    }
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'companies_patch_error', raw: e?.raw ?? null },
      { status: e?.status || 500 }
    );
  }
}