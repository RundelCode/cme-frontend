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
        "cme-monolith.vercel.app/api";
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
            const ids = idsParam
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);

            if (ids.length === 0) {
                return NextResponse.json({ profiles: [] }, { status: 200 });
            }

            if (ids.length === 1) {
                const up = await fetch(`${API}/profiles/${encodeURIComponent(ids[0])}`, {
                    method: "GET",
                    headers: baseHeaders,
                    credentials: "include",
                    cache: "no-store",
                });
                const { data } = await readJson(up);
                if (!up.ok) {
                    const msg = data?.error || data?.message || `profiles_upstream_${up.status}`;
                    return NextResponse.json({ error: msg }, { status: up.status || 404 });
                }
                const profile = data?.profile ?? data ?? null;
                if (!profile?.id) {
                    return NextResponse.json({ error: "not_found" }, { status: 404 });
                }
                return NextResponse.json({ profiles: mapProfiles([profile]) }, { status: 200 });
            }

            const results = await Promise.allSettled(
                ids.map((id) =>
                    fetch(`${API}/profiles/${encodeURIComponent(id)}`, {
                        method: "GET",
                        headers: baseHeaders,
                        credentials: "include",
                        cache: "no-store",
                    }).then(async (r) => {
                        const { data } = await readJson(r);
                        if (!r.ok) throw new Error(data?.error || data?.message || `profiles_upstream_${r.status}`);
                        return data?.profile ?? data ?? null;
                    })
                )
            );

            const profiles = results
                .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
                .map((r) => r.value)
                .filter((p) => p && p.id);

            return NextResponse.json({ profiles: mapProfiles(profiles) }, { status: 200 });
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

        const { data } = await readJson(up);
        if (!up.ok) {
            const msg = data?.error || data?.message || `profiles_search_upstream_${up.status}`;
            return NextResponse.json({ error: msg }, { status: up.status || 400 });
        }

        const profiles = mapProfiles(Array.isArray(data) ? data : data?.items ?? data?.profiles ?? []);
        return NextResponse.json({ profiles }, { status: 200 });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || "profiles_error" }, { status: e?.status || 500 });
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

        const { data } = await readJson(up);
        if (!up.ok) {
            const msg = data?.error || data?.message || `profiles_search_upstream_${up.status}`;
            return NextResponse.json({ error: msg }, { status: up.status || 400 });
        }

        const profiles = mapProfiles(Array.isArray(data) ? data : data?.items ?? data?.profiles ?? []);
        return NextResponse.json({ profiles }, { status: 200 });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || "profiles_error" }, { status: e?.status || 500 });
    }
}
