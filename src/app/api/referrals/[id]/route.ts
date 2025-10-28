import { NextRequest, NextResponse } from "next/server";

function buildAuthHeader(req: NextRequest) {
    const h = req.headers.get("authorization");
    if (h && h.trim() !== "") return h;
    const token = req.cookies.get("access_token")?.value;
    if (token && token.trim() !== "") return `Bearer ${token}`;
    const cookie = req.headers.get("cookie") ?? "";
    const m = cookie.match(/(?:^|;\s*)access_token=([^;]+)/i);
    if (m?.[1]) return `Bearer ${decodeURIComponent(m[1])}`;
    return undefined;
}

function resolveReferralsBase(req: NextRequest) {
    const base =
        process.env.NEXT_PUBLIC_REFERRALS_BASE ||
        process.env.REFERRALS_BASE ||
        process.env.NEXT_PUBLIC_API_URL ||
        process.env.API_URL ||
        "cme-monolith.vercel.app/api"; // fallback al gateway solo si no hay envs
    if (/^https?:\/\//i.test(base)) return base.replace(/\/$/, "");
    return new URL(base, req.nextUrl.origin).toString().replace(/\/$/, "");
}

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
    try {
        const { id } = ctx.params;
        if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

        const API = resolveReferralsBase(req);
        const auth = buildAuthHeader(req);
        const cookie = req.headers.get("cookie") ?? "";
        const body = await req.json().catch(() => ({}));

        const up = await fetch(`${API}/referrals/${encodeURIComponent(id)}`, {
            method: "PATCH",
            headers: {
                "content-type": "application/json",
                accept: "application/json",
                ...(auth ? { Authorization: auth } : {}),
                ...(cookie ? { cookie } : {}),
            },
            body: JSON.stringify(body || {}),
            credentials: "include",
            cache: "no-store",
        });

        const text = await up.text();
        let data: any = null;
        try { data = text ? JSON.parse(text) : null; } catch { }

        if (!up.ok) {
            const msg = data?.error || data?.message || `referrals_upstream_${up.status}`;
            return NextResponse.json({ error: msg }, { status: up.status || 502 });
        }

        return NextResponse.json(data ?? { ok: true });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || "referrals_patch_error" }, { status: 500 });
    }
}

export async function OPTIONS() {
    return NextResponse.json({}, { status: 200 });
}
