// src/app/api/notifications/[id]/read/route.ts
import { NextResponse, NextRequest } from "next/server";

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
        "https://cme-monolith-7hth.onrender.com";
    try {
        new URL(base);
        return base.replace(/\/$/, "");
    } catch {
        const u = new URL(reqUrl);
        return new URL(base, u.origin).toString().replace(/\/$/, "");
    }
}

export async function PATCH(req: NextRequest, context: any) {
    try {
        const id = context?.params?.id;
        if (!id) {
            return NextResponse.json(
                { error: "missing_notification_id" },
                { status: 400 }
            );
        }

        const API = resolveApiUrl(req.url);
        const authorization = buildAuthHeader(req);
        const cookie = req.headers.get("cookie") ?? "";

        const upstream = await fetch(
            `${API}/notifications/${encodeURIComponent(id)}/read`,
            {
                method: "PATCH",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                    ...(authorization ? { Authorization: authorization } : {}),
                    ...(cookie ? { cookie } : {}),
                },
                credentials: "include",
                cache: "no-store",
                body: JSON.stringify({ readAt: new Date().toISOString() }),
            }
        );

        const raw = await upstream.text();
        let data: any = null;
        try {
            data = raw ? JSON.parse(raw) : null;
        } catch {
            return NextResponse.json(
                { error: "upstream_not_json", details: raw?.slice(0, 300) },
                { status: 502 }
            );
        }

        if (!upstream.ok) {
            const msg =
                data?.error ||
                data?.message ||
                `notifications_upstream_${upstream.status}`;
            return NextResponse.json({ error: msg }, { status: upstream.status || 500 });
        }

        return NextResponse.json({ notification: data }, { status: 200 });
    } catch (e: any) {
        return NextResponse.json(
            { error: e?.message || "Error marking as read" },
            { status: 500 }
        );
    }
}

export async function OPTIONS() {
    return NextResponse.json({}, { status: 200 });
}
