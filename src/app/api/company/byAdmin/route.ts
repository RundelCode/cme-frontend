import { NextRequest, NextResponse } from "next/server";

function buildAuthHeader(req: NextRequest): string | undefined {
    const fromHeader = req.headers.get("authorization");
    if (fromHeader && fromHeader.trim() !== "") return fromHeader;
    const cookieHeader = req.headers.get("cookie") ?? "";
    const m = cookieHeader.match(/(?:^|;\s*)access_token=([^;]+)/i);
    if (m?.[1]) return `Bearer ${decodeURIComponent(m[1])}`;
    return undefined;
}

function resolveApiBase() {
    return (
        process.env.NEXT_PUBLIC_API_URL ||
        "https://cme-back-3tsc.onrender.com/api"
    ).replace(/\/+$/, "");
}

function camelCompany(c: any) {
    if (!c) return c;
    return {
        id: c.id,
        name: c.name,
        email: c.email ?? null,
        website: c.website ?? null,
        description: c.description ?? null,
        industry: c.industry ?? null,
        location: c.location ?? null,
        profilePicture: c.profile_picture ?? null,
        coverPhoto: c.cover_photo ?? null,
        companyRating: c.company_rating ?? null,
        boolVerified: c.bool_verified ?? null,
        verifiedAt: c.verified_at ?? null,
        subscriptionPlan: c.subscription_plan ?? null,
        adminId: c.admin_id ?? null,
        createdAt: c.created_at,
        updatedAt: c.updated_at ?? null,
    };
}

export async function GET(req: NextRequest) {
    const url = new URL(req.url);
    const adminId = url.searchParams.get("id");
    if (!adminId) {
        return NextResponse.json(
            { error: "Missing ?id parameter" },
            { status: 400 }
        );
    }

    const API = resolveApiBase();
    const target = `${API}/companies/by-admin/${encodeURIComponent(adminId)}`;

    const headers: Record<string, string> = { Accept: "application/json" };
    const auth = buildAuthHeader(req);
    if (auth) headers.Authorization = auth;

    const upstream = await fetch(target, { headers, cache: "no-store" });
    const raw = await upstream.text();

    let data: any = null;
    try {
        data = raw ? JSON.parse(raw) : null;
    } catch { }

    if (!upstream.ok) {
        return NextResponse.json(
            { error: `upstream_${upstream.status}`, raw: data ?? raw, target },
            { status: upstream.status || 502 }
        );
    }

    return NextResponse.json(
        Array.isArray(data)
            ? data.map(camelCompany)
            : Array.isArray(data?.items)
                ? data.items.map(camelCompany)
                : camelCompany(data)
    );
}
