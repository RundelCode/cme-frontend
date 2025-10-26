import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const COMPANIES_BASE =
    process.env.COMPANIES_BASE_URL ?? "http://localhost:3009";

function buildAuthHeader(req: NextRequest): string | undefined {
    const fromHeader = req.headers.get("authorization");
    if (fromHeader && fromHeader.trim() !== "") return fromHeader;

    const token = req.cookies.get("access_token")?.value;
    if (token && token.trim() !== "") return `Bearer ${token}`;

    const cookieHeader = req.headers.get("cookie") ?? "";
    const m = cookieHeader.match(/(?:^|;\s*)access_token=([^;]+)/i);
    if (m?.[1]) return `Bearer ${decodeURIComponent(m[1])}`;
    return undefined;
}

export async function GET(req: NextRequest, context: { params: { id: string } }) {
    try {
        const { id } = context.params;

        const authorization = buildAuthHeader(req);
        const cookie = req.headers.get("cookie") ?? "";

        const upstream = await fetch(`${COMPANIES_BASE}/companies/${id}`, {
            method: "GET",
            headers: {
                Accept: "application/json",
                ...(authorization ? { authorization } : {}),
                cookie,
            },
            cache: "no-store",
        });

        const data = await upstream.json().catch(() => null);
        if (!upstream.ok) {
            const msg =
                data?.error ||
                data?.message ||
                `companies_upstream_${upstream.status}`;
            return NextResponse.json({ error: msg }, { status: upstream.status });
        }

        const company = {
            id: data?.id,
            name: data?.name ?? data?.company_name ?? null,
            email: data?.email ?? null,
            profilePicture: data?.profile_picture ?? null,
            coverPhoto: data?.cover_photo ?? null,
            location: data?.location ?? null,
            createdAt: data?.created_at ?? null,
            updatedAt: data?.updated_at ?? null,
        };

        return NextResponse.json(company);
    } catch (e: any) {
        return NextResponse.json(
            { error: e?.message || "companies_proxy_error" },
            { status: 500 }
        );
    }
}

export async function OPTIONS(_req: Request) {
    return NextResponse.json({}, { status: 200 });
}
