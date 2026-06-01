import { NextRequest, NextResponse } from "next/server";
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

        const API =
            resolveApiUrl(req);

        const auth =
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

        const up = await fetch(
            `${API}/referrals/${encodeURIComponent(
                id
            )}`,
            {
                method: "PATCH",
                headers: {
                    "content-type":
                        "application/json",
                    accept:
                        "application/json",
                    ...(auth
                        ? {
                            Authorization:
                                auth,
                        }
                        : {}),
                    ...(cookie
                        ? {
                            cookie,
                        }
                        : {}),
                },
                body: JSON.stringify(
                    body || {}
                ),
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
        } catch {
            data = null;
        }

        if (!up.ok) {
            const msg =
                data?.error ||
                data?.message ||
                `referrals_upstream_${up.status}`;

            return NextResponse.json(
                {
                    error: msg,
                },
                {
                    status:
                        up.status ||
                        502,
                }
            );
        }

        return NextResponse.json(
            data ?? {
                ok: true,
            }
        );
    } catch (e: any) {
        return NextResponse.json(
            {
                error:
                    e?.message ||
                    "referrals_patch_error",
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