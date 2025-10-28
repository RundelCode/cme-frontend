import { NextRequest, NextResponse } from "next/server";

function resolveReferralsBase(req: NextRequest) {
    const base =
        process.env.NEXT_PUBLIC_REFERRALS_BASE ||
        process.env.REFERRALS_BASE ||
        process.env.NEXT_PUBLIC_API_URL ||
        process.env.API_URL ||
        "http://localhost:3000/api";
    if (/^https?:\/\//i.test(base)) return base.replace(/\/$/, "");
    return new URL(base, req.nextUrl.origin).toString().replace(/\/$/, "");
}

export async function POST(req: NextRequest) {
    try {
        const API = resolveReferralsBase(req);
        const auth = req.headers.get("authorization") ?? undefined;
        const cookie = req.headers.get("cookie") ?? "";
        const payload = await req.json().catch(() => ({})) as { id?: string; status?: string };

        if (!payload?.id || !payload?.status) {
            return NextResponse.json({ error: "missing id/status" }, { status: 400 });
        }

        const up = await fetch(`${API}/referrals/${encodeURIComponent(payload.id)}`, {
            method: "PATCH",
            headers: {
                "content-type": "application/json",
                accept: "application/json",
                ...(auth ? { Authorization: auth } : {}),
                ...(cookie ? { cookie } : {}),
            },
            body: JSON.stringify({ status: payload.status }),
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
        return NextResponse.json({ error: e?.message || "update_status_error" }, { status: 500 });
    }
}

export async function OPTIONS() {
    return NextResponse.json({}, { status: 200 });
}
