import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
    buildAuthHeader,
    resolveApiUrl,
    readJsonStrict,
} from "@/app/api/_utils/proxy-helpers";

function camelToSnakeKey(k: string) {
    return k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

function camelToSnakePayload(obj: Record<string, any>) {
    const out: Record<string, any> = {};

    for (const [k, v] of Object.entries(obj ?? {})) {
        out[camelToSnakeKey(k)] = v;
    }

    return out;
}

export async function POST(req: NextRequest) {
    try {
        const API = resolveApiUrl(req);
        const auth = buildAuthHeader(req);
        const cookie = req.headers.get("cookie") ?? "";

        const headers: HeadersInit = {
            Accept: "application/json",
            ...(auth ? { Authorization: auth } : {}),
            ...(cookie ? { cookie } : {}),
            "Content-Type": "application/json",
        };

        const payload = await req.json().catch(() => ({}));
        const snake = camelToSnakePayload(payload);

        const response = await fetch(`${API}/profiles/me`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(snake),
            cache: "no-store",
            credentials: "include",
        });

        const { data, raw } = await readJsonStrict(response);

        if (!response.ok) {
            return NextResponse.json(
                {
                    ok: false,
                    error: data ?? raw,
                },
                {
                    status: response.status,
                }
            );
        }

        return NextResponse.json({
            ok: true,
            profile: data?.profile ?? data ?? null,
        });
    } catch (error: any) {
        return NextResponse.json(
            {
                ok: false,
                error: error?.message || "internal_error",
            },
            {
                status: 500,
            }
        );
    }
}

export async function OPTIONS() {
    return NextResponse.json({}, { status: 200 });
}
