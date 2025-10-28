import type { NextRequest } from "next/server";

export function buildAuthHeader(req: NextRequest | Request): string | undefined {
    const h = req.headers.get("authorization");
    if (h && h.trim() !== "") return h;

    // cookies comunes (supabase/propio)
    const cookieHeader = req.headers.get("cookie") ?? "";
    const read = (name: string) => {
        const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`, "i"));
        return m?.[1] ? decodeURIComponent(m[1]) : null;
    };
    const access = (read("access_token") || read("sb-access-token"));
    if (access && access.trim() !== "") return `Bearer ${access}`;

    const packed = read("supabase-auth-token");
    if (packed) {
        try {
            const parsed = JSON.parse(packed);
            if (Array.isArray(parsed) && typeof parsed[0] === "string" && parsed[0]) return `Bearer ${parsed[0]}`;
            if (parsed && typeof parsed === "object" && typeof (parsed as any).access_token === "string") {
                return `Bearer ${(parsed as any).access_token}`;
            }
        } catch { }
    }
    return undefined;
}

export function resolveApiUrl(input: NextRequest | Request | string) {
    const base =
        process.env.NEXT_PUBLIC_API_URL ||
        process.env.API_URL ||
        "http://localhost:3001/api"; // <- BACKEND por defecto (NO 3000)

    const trim = (s: string) => s.replace(/\/$/, "");
    if (/^https?:\/\//i.test(base)) return trim(base);

    const url = typeof input === "string" ? new URL(input) : new URL((input as Request).url);
    return trim(new URL(base, url.origin).toString());
}

export async function readJsonStrict(res: Response) {
    const raw = await res.text();
    let data: any = null;
    try { data = raw ? JSON.parse(raw) : null; }
    catch {
        const e: any = new Error("upstream_not_json");
        e.status = res.status;
        e.raw = raw?.slice(0, 1000);
        throw e;
    }
    return { data, raw };
}

// normaliza casing del job para que SIEMPRE exista job.company_id
export function normalizeJob(job: any): any {
    if (!job || typeof job !== "object") return job;
    const company_id = job.company_id ?? job.companyId ?? null;
    return { ...job, company_id };
}

// normaliza empresa (no hacemos cambios agresivos; solo passthrough seguro)
export function normalizeCompany(c: any): any {
    if (!c || typeof c !== "object") return c;
    return c;
}
