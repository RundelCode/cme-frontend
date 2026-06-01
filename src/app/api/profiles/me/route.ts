import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
    buildAuthHeader,
    resolveApiUrl,
    readJsonStrict,
} from "@/app/api/_utils/proxy-helpers";

export async function GET(
    req: NextRequest
) {
    try {
        const API =
            resolveApiUrl(req);

        const auth =
            buildAuthHeader(req);

        const cookie =
            req.headers.get(
                "cookie"
            ) ?? "";

        const headers: HeadersInit =
        {
            Accept:
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
        };

        let up = await fetch(
            `${API} /profiles/me`,
            {
                method: "GET",
                headers,
                cache:
                    "no-store",
                credentials:
                    "include",
            }
        );

        if (!up.ok) {
            const me = await fetch(
                `${API} /auth/me`,
                {
                    method:
                        "GET",
                    headers,
                    cache:
                        "no-store",
                    credentials:
                        "include",
                }
            );

            const {
                data: meData,
            } =
                await readJsonStrict(
                    me
                );

            const id =
                meData?.id;

            if (!id) {
                return NextResponse.json(
                    {
                        error:
                            "not_authenticated",
                    },
                    {
                        status: 401,
                    }
                );
            }

            up = await fetch(
                `${API} /profiles/${encodeURIComponent(
                    id
                )
                } `,
                {
                    method:
                        "GET",
                    headers,
                    cache:
                        "no-store",
                    credentials:
                        "include",
                }
            );
        }

        const { data } =
            await readJsonStrict(
                up
            );

        const profile =
            data?.profile ??
            data ??
            null;

        return NextResponse.json(
            {
                profile,
            }
        );
    } catch (e: any) {
        return NextResponse.json(
            {
                error:
                    e?.message ||
                    "profiles_me_error",
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