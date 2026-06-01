import { NextResponse, NextRequest } from "next/server";
import {
    buildAuthHeader,
    resolveApiUrl,
    readJsonStrict,
} from "@/app/api/_utils/proxy-helpers";

export async function PATCH(
    req: NextRequest,
    context: any
) {
    try {
        const id =
            context?.params?.id;

        if (!id) {
            return NextResponse.json(
                {
                    error:
                        "missing_notification_id",
                },
                {
                    status: 400,
                }
            );
        }

        const API =
            resolveApiUrl(req);

        const authorization =
            buildAuthHeader(req);

        const cookie =
            req.headers.get(
                "cookie"
            ) ?? "";

        const upstream =
            await fetch(
                `${API}/notifications/${encodeURIComponent(
                    id
                )}/read`,
                {
                    method:
                        "PATCH",
                    headers: {
                        Accept:
                            "application/json",
                        "Content-Type":
                            "application/json",
                        ...(authorization
                            ? {
                                Authorization:
                                    authorization,
                            }
                            : {}),
                        ...(cookie
                            ? {
                                cookie,
                            }
                            : {}),
                    },
                    credentials:
                        "include",
                    cache:
                        "no-store",
                    body: JSON.stringify(
                        {
                            readAt:
                                new Date().toISOString(),
                        }
                    ),
                }
            );

        let data: any;

        try {
            const parsed =
                await readJsonStrict(
                    upstream
                );

            data =
                parsed.data;
        } catch (e: any) {
            return NextResponse.json(
                {
                    error:
                        "upstream_not_json",
                    details:
                        e?.raw ??
                        null,
                },
                {
                    status: 502,
                }
            );
        }

        if (!upstream.ok) {
            const msg =
                data?.error ||
                data?.message ||
                `notifications_upstream_${upstream.status}`;

            return NextResponse.json(
                {
                    error:
                        msg,
                },
                {
                    status:
                        upstream.status ||
                        500,
                }
            );
        }

        return NextResponse.json(
            {
                notification:
                    data,
            },
            {
                status: 200,
            }
        );
    } catch (e: any) {
        return NextResponse.json(
            {
                error:
                    e?.message ||
                    "Error marking as read",
            },
            {
                status: 500,
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