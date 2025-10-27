// src/app/api/profiles/route.ts
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
        "http://localhost:3000/api";
    try {
        new URL(base);
        return base.replace(/\/$/, "");
    } catch {
        const u = new URL(reqUrl);
        return new URL(base, u.origin).toString().replace(/\/$/, "");
    }
}

function mapProfiles(arr: any[]): any[] {
    return (arr || []).map((p) => ({
        ...p,
        reputation_score:
            p?.reputation_score == null
                ? null
                : typeof p.reputation_score === "number"
                    ? p.reputation_score
                    : Number(p.reputation_score) || 0,
    }));
}

export async function GET(req: Request) {
    try {
        const API = resolveApiUrl(req.url);
        const url = new URL(req.url);
        const authorization = buildAuthHeader(req);
        const cookie = req.headers.get("cookie") ?? "";
        const xReqId = req.headers.get("x-request-id") || "";
        const xCorrId = req.headers.get("x-correlation-id") || "";

        const baseHeaders: HeadersInit = {
            Accept: "application/json",
            ...(authorization ? { Authorization: authorization } : {}),
            ...(cookie ? { cookie } : {}),
            ...(xReqId ? { "x-request-id": xReqId } : {}),
            ...(xCorrId ? { "x-correlation-id": xCorrId } : {}),
        };

        const idsParam = url.searchParams.get("ids");
        if (idsParam) {
            const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
            const up = await fetch(`${API}/profiles/search`, {
                method: "POST",
                headers: { "content-type": "application/json", ...baseHeaders },
                body: JSON.stringify({ ids, limit: ids.length }),
                credentials: "include",
                cache: "no-store",
            });
            const raw = await up.text();
            let data: any = null;
            try {
                data = raw ? JSON.parse(raw) : null;
            } catch {
                return NextResponse.json(
                    { error: "upstream_not_json", details: raw?.slice(0, 300) },
                    { status: 502 }
                );
            }
            if (!up.ok) {
                const msg = data?.error || data?.message || `profiles_search_upstream_${up.status}`;
                return NextResponse.json({ error: msg }, { status: up.status || 400 });
            }
            const profiles = mapProfiles(Array.isArray(data) ? data : data?.items ?? data?.profiles ?? []);
            return NextResponse.json({ profiles });
        }

        const q = url.searchParams.get("q") || undefined;
        const sortBy = url.searchParams.get("sortBy") || undefined;
        const order = url.searchParams.get("order") || undefined;
        const limit = url.searchParams.get("limit");
        const offset = url.searchParams.get("offset");

        const up = await fetch(`${API}/profiles/search`, {
            method: "POST",
            headers: { "content-type": "application/json", ...baseHeaders },
            body: JSON.stringify({
                q,
                sortBy,
                order,
                limit: limit ? Number(limit) : 20,
                offset: offset ? Number(offset) : 0,
            }),
            credentials: "include",
            cache: "no-store",
        });

        const raw = await up.text();
        let data: any = null;
        try {
            data = raw ? JSON.parse(raw) : null;
        } catch {
            return NextResponse.json(
                { error: "upstream_not_json", details: raw?.slice(0, 300) },
                { status: 502 }
            );
        }

        if (!up.ok) {
            const msg = data?.error || data?.message || `profiles_search_upstream_${up.status}`;
            return NextResponse.json({ error: msg }, { status: up.status || 400 });
        }

        const profiles = mapProfiles(Array.isArray(data) ? data : data?.items ?? data?.profiles ?? []);
        return NextResponse.json({ profiles });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || "profiles_error" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const API = resolveApiUrl(req.url);
        const authorization = buildAuthHeader(req);
        const cookie = req.headers.get("cookie") ?? "";
        const xReqId = req.headers.get("x-request-id") || "";
        const xCorrId = req.headers.get("x-correlation-id") || "";
        const body = await req.json().catch(() => ({}));

        const up = await fetch(`${API}/profiles/search`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                Accept: "application/json",
                ...(authorization ? { Authorization: authorization } : {}),
                ...(cookie ? { cookie } : {}),
                ...(xReqId ? { "x-request-id": xReqId } : {}),
                ...(xCorrId ? { "x-correlation-id": xCorrId } : {}),
            },
            body: JSON.stringify(body || {}),
            credentials: "include",
            cache: "no-store",
        });

        const raw = await up.text();
        let data: any = null;
        try {
            data = raw ? JSON.parse(raw) : null;
        } catch {
            return NextResponse.json(
                { error: "upstream_not_json", details: raw?.slice(0, 300) },
                { status: 502 }
            );
        }

        if (!up.ok) {
            const msg = data?.error || data?.message || `profiles_search_upstream_${up.status}`;
            return NextResponse.json({ error: msg }, { status: up.status || 400 });
        }

        const profiles = mapProfiles(Array.isArray(data) ? data : data?.items ?? data?.profiles ?? []);
        return NextResponse.json({ profiles });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || "profiles_error" }, { status: 500 });
    }
}
