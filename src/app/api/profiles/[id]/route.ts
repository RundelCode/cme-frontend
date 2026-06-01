import { NextResponse } from "next/server";
import {
    buildAuthHeader,
    resolveApiUrl,
    readJsonStrict,
} from "@/app/api/_utils/proxy-helpers";

export async function GET(
    req: Request,
    context: any
) {
    try {
        const id = context?.params?.id;

        if (!id) {
            return NextResponse.json(
                {
                    error: "missing_id",
                },
                {
                    status: 400,
                }
            );
        }

        const API = resolveApiUrl(req);

        const authorization =
            buildAuthHeader(req);

        const cookie =
            req.headers.get("cookie") ??
            "";

        const xReqId =
            req.headers.get(
                "x-request-id"
            ) || "";

        const xCorrId =
            req.headers.get(
                "x-correlation-id"
            ) || "";

        const headers: HeadersInit =
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
            ...(xReqId
                ? {
                    "x-request-id":
                        xReqId,
                }
                : {}),
            ...(xCorrId
                ? {
                    "x-correlation-id":
                        xCorrId,
                }
                : {}),
        };

        const up = await fetch(
            `${API} /profiles/${encodeURIComponent(
                id
            )
            } `,
            {
                method: "GET",
                headers,
                credentials:
                    "include",
                cache:
                    "no-store",
            }
        );

        let data: any;

        try {
            const parsed =
                await readJsonStrict(
                    up
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

        if (!up.ok) {
            const msg =
                data?.error ||
                data?.message ||
                `profiles_upstream_${up.status} `;

            return NextResponse.json(
                {
                    error: msg,
                },
                {
                    status:
                        up.status ||
                        404,
                }
            );
        }

        const profile =
            data?.profile ??
            data ??
            null;

        if (!profile?.id) {
            return NextResponse.json(
                {
                    error:
                        "not_found",
                },
                {
                    status: 404,
                }
            );
        }

        return NextResponse.json(
            {
                profile,
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
                    "profiles_id_error",
            },
            {
                status: 500,
            }
        );
    }
}