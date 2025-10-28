import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

function buildAuthHeader(req: NextRequest): string | undefined {
    const fromHeader = req.headers.get('authorization');
    if (fromHeader && fromHeader.trim() !== '') return fromHeader;
    const cookieHeader = req.headers.get('cookie') ?? '';
    const m = cookieHeader.match(/(?:^|;\s*)access_token=([^;]+)/i);
    if (m?.[1]) return `Bearer ${decodeURIComponent(m[1])}`;
    return undefined;
}

function resolveApiUrl(req: NextRequest) {
    const base =
        process.env.NEXT_PUBLIC_API_URL ||
        process.env.API_URL ||
        'http://localhost:3000/api';
    if (/^https?:\/\//i.test(base)) return base.replace(/\/$/, '');
    return new URL(base, req.nextUrl.origin).toString().replace(/\/$/, '');
}

async function readUpstream(res: Response) {
    const text = await res.text().catch(() => '');
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { }
    return { ok: res.ok, status: res.status, data, text, url: res.url };
}

export async function POST(req: NextRequest) {
    try {
        const API = resolveApiUrl(req);
        const authorization = buildAuthHeader(req);
        const cookie = req.headers.get('cookie') ?? '';
        const body = await req.json().catch(() => ({}));
        if (typeof body?.direction === 'string') body.direction = body.direction.toLowerCase();

        const upstream = await fetch(`${API}/payments`, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                ...(authorization ? { Authorization: authorization } : {}),
                ...(cookie ? { cookie } : {}),
            },
            body: JSON.stringify(body),
            credentials: 'include',
            cache: 'no-store',
        });

        const parsed = await readUpstream(upstream);
        if (!parsed.ok) {
            const msg = (parsed.data && (parsed.data.error || parsed.data.message)) || `payments_upstream_${parsed.status}`;
            return NextResponse.json({ error: msg, raw: typeof parsed.data === 'object' ? parsed.data : parsed.text?.slice(0, 800) }, { status: parsed.status || 502 });
        }
        return NextResponse.json(parsed.data ?? { ok: true }, { status: 201 });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || 'payments_proxy_error' }, { status: 500 });
    }
}
