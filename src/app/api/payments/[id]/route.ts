import { NextRequest, NextResponse } from "next/server";
import {
    buildAuthHeader,
    resolveApiUrl,
    readJsonStrict,
} from "@/app/api/_utils/proxy-helpers";

async function readUpstream(res: Response) {
    try {
        const { data, raw } = await readJsonStrict(res);

        return {
            ok: res.ok,
            status: res.status,
            data,
            text: raw,
            url: res.url,
        };
    } catch (e: any) {
        return {
            ok: res.ok,
            status: res.status,
            data: null,
            text: e?.raw ?? "",
            url: res.url,
        };
    }
}

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
                        "missing_id",
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

        const body =
            await req
                .json()
                .catch(
                    () => ({})
                );

        const upstream =
            await fetch(
                `${API} /payments/${encodeURIComponent(
                    id
                )
                } `,
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
                    body: JSON.stringify(
                        body
                    ),
                    credentials:
                        "include",
                    cache:
                        "no-store",
                }
            );

        const parsed =
            await readUpstream(
                upstream
            );

        if (!parsed.ok) {
            const msg =
                (parsed.data &&
                    (parsed.data.error ||
                        parsed.data.message)) ||
                `payments_patch_upstream_${parsed.status} `;

            return NextResponse.json(
                {
                    error: msg,
                    raw:
                        typeof parsed.data ===
                            "object"
                            ? parsed.data
                            : parsed.text?.slice(
                                0,
                                800
                            ),
                },
                {
                    status:
                        parsed.status ||
                        502,
                }
            );
        }

        return NextResponse.json(
            parsed.data ?? {
                ok: true,
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
                    "payments_id_proxy_error",
            },
            {
                status: 500,
            }
        );
    }
}