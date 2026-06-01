import { NextResponse } from "next/server";

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
        "cme-monolith.vercel.app/api";
    try {
        new URL(base);
        return base.replace(/\/$/, "");
    } catch {
        const u = new URL(reqUrl);
        return new URL(base, u.origin).toString().replace(/\/$/, "");
    }
}

export async function GET(req: Request, context: any) {
    try {
        const { id } = await context.params;
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

        const up = await fetch(`${API}/profiles/${encodeURIComponent(id)}`, {
            method: "GET",
            headers,
            credentials: "include",
            cache: "no-store",
        });

        const raw = await up.text();
        let data: any = null;
        try { data = raw ? JSON.parse(raw) : null; } catch {
            return NextResponse.json({ error: "upstream_not_json", details: raw?.slice(0, 300) }, { status: 502 });
        }

        if (!up.ok) {
            const msg = data?.error || data?.message || `profiles_upstream_${up.status}`;
            return NextResponse.json({ error: msg }, { status: up.status || 404 });
        }

        const profile = data?.profile ?? data ?? null;
        if (!profile?.id) return NextResponse.json({ error: "not_found" }, { status: 404 });

        return NextResponse.json({ profile });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || "profiles_id_error" }, { status: 500 });
    }
}
