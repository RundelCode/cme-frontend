import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
    buildAuthHeader,
    resolveApiUrl,
    readJsonStrict,
} from "@/app/api/_utils/proxy-helpers";

async function fetchJson(
    url: string,
    init: RequestInit
) {
    const res = await fetch(
        url,
        init
    );

    const { data, raw } =
        await readJsonStrict(res);

    if (!res.ok) {
        const msg =
            data?.message ||
            data?.error ||
            `upstream_error (${res.status})`;

        const err: any =
            new Error(msg);

        err.status =
            res.status;

        err.data =
            data;

        err.raw =
            raw;

        throw err;
    }

    return data;
}

export async function GET(
    req: NextRequest
) {
    try {
        const API =
            resolveApiUrl(req);

        const url =
            new URL(req.url);

        const from =
            url.searchParams.get(
                "from"
            );

        const to =
            url.searchParams.get(
                "to"
            );

        const authorization =
            buildAuthHeader(req);

        const cookie =
            req.headers.get(
                "cookie"
            ) ?? "";

        const baseHeaders: HeadersInit =
        {
            Accept:
                "application/json",
            ...(authorization
                ? {
                    Authorization:
                        authorization,
                }
                : {}),
            ...(cookie
                ? { cookie }
                : {}),
        };

        let me: any =
            null;

        try {
            me =
                await fetchJson(
                    `${API}/auth/me`,
                    {
                        method:
                            "GET",
                        headers:
                            baseHeaders,
                        cache:
                            "no-store",
                        credentials:
                            "include",
                    }
                );
        } catch {
            try {
                me =
                    await fetchJson(
                        `${API}/profiles/me`,
                        {
                            method:
                                "GET",
                            headers:
                                baseHeaders,
                            cache:
                                "no-store",
                            credentials:
                                "include",
                        }
                    );
            } catch (e: any) {
                return NextResponse.json(
                    {
                        total: 0,
                        items: [],
                        error:
                            e?.message ||
                            "No autenticado",
                    },
                    {
                        status:
                            e?.status ===
                                401
                                ? 401
                                : 500,
                    }
                );
            }
        }

        const userId:
            | string
            | undefined =
            me?.id;

        if (!userId) {
            return NextResponse.json(
                {
                    total: 0,
                    items: [],
                    error:
                        "No autenticado (sin userId)",
                },
                {
                    status: 401,
                }
            );
        }

        const qs =
            new URLSearchParams();

        qs.set(
            "headhunterId",
            userId
        );

        qs.set(
            "all",
            "true"
        );

        if (from) {
            qs.set(
                "from",
                from
            );
        }

        if (to) {
            qs.set(
                "to",
                to
            );
        }

        const referrals =
            await fetchJson(
                `${API}/referrals?${qs.toString()}`,
                {
                    method:
                        "GET",
                    headers:
                        baseHeaders,
                    cache:
                        "no-store",
                    credentials:
                        "include",
                }
            );

        return NextResponse.json(
            referrals
        );
    } catch (e: any) {
        const msg =
            e?.message ||
            "referrals_proxy_error";

        const isAuth =
            /unauthorized|forbidden|token|auth/i.test(
                msg
            );

        return NextResponse.json(
            {
                total: 0,
                items: [],
                error: msg,
            },
            {
                status: isAuth
                    ? 401
                    : e?.status ||
                    500,
            }
        );
    }
}

export async function OPTIONS() {
    return NextResponse.json(
        {},
        {
            status: 200,
        }
    );
}