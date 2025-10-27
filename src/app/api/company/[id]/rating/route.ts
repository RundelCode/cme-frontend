import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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
        "http://localhost:3000/api";
    try {
        new URL(base);
        return base.replace(/\/$/, "");
    } catch {
        const u = new URL(reqUrl);
        return new URL(base, u.origin).toString().replace(/\/$/, "");
    }
}

async function readJson(res: Response) {
    const raw = await res.text();
    let data: any = null;
    try {
        data = raw ? JSON.parse(raw) : null;
    } catch {
        const e: any = new Error("upstream_not_json");
        e.status = res.status;
        e.raw = raw?.slice(0, 600);
        throw e;
    }
    return { data, raw };
}

// Utilidad: copia solo claves permitidas y definidas (sin undefined)
function pickDefined<T extends object>(obj: any, keys: Array<keyof T>) {
    const out: any = {};
    for (const k of keys as string[]) {
        if (k in obj) out[k] = obj[k];
    }
    return out;
}

export async function PATCH(
    req: Request,
    ctx: { params: Promise<{ id: string }> | { id: string } }
) {
    try {
        const params = "then" in ctx.params ? await ctx.params : (ctx.params as { id: string });
        const { id } = params;
        if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

        const API = resolveApiUrl(req.url);
        const auth = buildAuthHeader(req);
        const cookie = req.headers.get("cookie") ?? "";
        const xReqId = req.headers.get("x-request-id") || "";
        const xCorrId = req.headers.get("x-correlation-id") || "";

        const { rating } = await req.json().catch(() => ({} as { rating?: number }));
        const numeric = Number(rating);
        if (!Number.isFinite(numeric) || numeric < 0 || numeric > 5) {
            return NextResponse.json({ error: "invalid_rating" }, { status: 400 });
        }

        const baseHeaders: HeadersInit = {
            Accept: "application/json",
            ...(auth ? { Authorization: auth } : {}),
            ...(cookie ? { cookie } : {}),
            ...(xReqId ? { "x-request-id": xReqId } : {}),
            ...(xCorrId ? { "x-correlation-id": xCorrId } : {}),
        };

        // 1) Leer empresa actual
        const getRes = await fetch(`${API}/companies/${encodeURIComponent(id)}`, {
            method: "GET",
            headers: baseHeaders,
            credentials: "include",
            cache: "no-store",
        });
        const { data: getData } = await readJson(getRes);
        if (!getRes.ok) {
            const msg = getData?.error || getData?.message || `companies_get_upstream_${getRes.status}`;
            return NextResponse.json({ error: msg }, { status: getRes.status || 404 });
        }

        // El backend puede devolver camelCase o snake_case.
        // Normalizamos a un objeto "current" conservando ambas variantes para luego reenviarlas.
        const c = getData?.company ?? getData ?? {};

        // bool_verified: si no viene booleano, forzar false para no romper NOT NULL
        const currentBool =
            typeof c.bool_verified === "boolean"
                ? c.bool_verified
                : typeof c.boolVerified === "boolean"
                    ? c.boolVerified
                    : false;

        // Campos que podríamos necesitar reenviar para evitar nulls si el update es total:
        // * Usa ambas variantes por si el DTO espera camel o snake.
        const preserve = {
            // Identidad básica
            id: c.id,
            name: c.name,
            email: c.email,
            website: c.website ?? c.website_url,
            description: c.description,
            industry: c.industry,
            location: c.location,

            // Imágenes
            profile_picture: c.profile_picture ?? c.profilePicture,
            profilePicture: c.profilePicture ?? c.profile_picture,
            cover_photo: c.cover_photo ?? c.coverPhoto,
            coverPhoto: c.coverPhoto ?? c.cover_photo,

            // Subscripción
            subscription_plan: c.subscription_plan ?? c.subscriptionPlan,
            subscriptionPlan: c.subscriptionPlan ?? c.subscription_plan,

            // Verificación (ambas variantes)
            bool_verified: currentBool,
            boolVerified: currentBool,
        };

        // 2) Cuerpo del patch: preservamos campos + seteamos rating en ambas variantes
        const patchBody = {
            ...pickDefined<typeof preserve>(preserve, Object.keys(preserve) as any),
            company_rating: numeric,
            companyRating: numeric,
        };

        const up = await fetch(`${API}/companies/${encodeURIComponent(id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ...baseHeaders },
            body: JSON.stringify(patchBody),
            credentials: "include",
            cache: "no-store",
        });

        const { data, raw } = await readJson(up);

        if (!up.ok) {
            const msg = data?.error || data?.message || `companies_patch_upstream_${up.status}`;
            return NextResponse.json({ error: msg, raw: data ?? raw }, { status: up.status || 502 });
        }

        const company = data?.company ?? data ?? null;
        if (company?.companyRating != null) {
            const n = Number(company.companyRating);
            company.companyRating = Number.isFinite(n) ? n : null;
        } else if (company?.company_rating != null) {
            const n = Number(company.company_rating);
            company.company_rating = Number.isFinite(n) ? n : null;
        }

        return NextResponse.json({ company });
    } catch (e: any) {
        return NextResponse.json(
            { error: e?.message || "companies_rating_patch_error", raw: e?.raw ?? null },
            { status: e?.status || 500 }
        );
    }
}
