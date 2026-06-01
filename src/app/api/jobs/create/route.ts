import { NextRequest, NextResponse } from "next/server";
import {
    buildAuthHeader,
    resolveApiUrl,
    readJsonStrict,
} from "@/app/api/_utils/proxy-helpers";

export async function POST(req: NextRequest) {
    try {
        const API = resolveApiUrl(req);

        const body = await req.json().catch(
            () => ({})
        );

        const auth =
            buildAuthHeader(req);

        const res = await fetch(
            `${API}/jobs`,
            {
                method: "POST",
                headers: {
                    "content-type":
                        "application/json",
                    ...(auth
                        ? {
                            authorization:
                                auth,
                        }
                        : {}),
                },
                body: JSON.stringify(
                    body
                ),
                credentials:
                    "include",
                cache: "no-store",
            }
        );

        let json: any = null;

        try {
            const parsed =
                await readJsonStrict(
                    res
                );

            json = parsed.data;
        } catch { }

        if (!res.ok) {
            return NextResponse.json(
                {
                    message:
                        json?.message ||
                        json?.error ||
                        `HTTP ${res.status}`,
                },
                {
                    status:
                        res.status,
                }
            );
        }

        return NextResponse.json(
            json,
            {
                status:
                    res.status,
            }
        );
    } catch (e: any) {
        return NextResponse.json(
            {
                message:
                    e?.message ||
                    "Error inesperado",
            },
            {
                status: 500,
            }
        );
    }
}
