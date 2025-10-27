import { NextResponse } from "next/server";

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
    return base.replace(/\/+$/, "");
  } catch {
    const u = new URL(reqUrl);
    return new URL(base, u.origin).toString().replace(/\/+$/, "");
  }
}

type Job = {
  id: string;
  company_id: string;
  title: string;
  description?: string | null;
  employment_type?: string | null;
  location_type?: string | null;
  skills?: string[] | null;
  requirements?: string | null;
  location?: string | null;
  salary?: number | null;
  currency?: string | null;
  created_at: string;
  updated_at?: string | null;
  status: string;
};

type CompanyRaw = {
  id: string;
  name: string;
  email?: string | null;
  website?: string | null;
  description?: string | null;
  industry?: string | null;
  location?: string | null;
  profile_picture?: string | null;
  cover_photo?: string | null;
  company_rating?: number | null;
  bool_verified?: boolean | null;
  verified_at?: string | null;
  subscription_plan?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const params = "then" in ctx.params ? await (ctx.params as Promise<{ id: string }>) : (ctx.params as { id: string });
    const { id } = params;
    if (!id) return NextResponse.json({ job: null, company: null, error: "missing_job_id" }, { status: 400 });

    const API = resolveApiUrl(req.url);
    const authorization = buildAuthHeader(req);
    const cookie = req.headers.get("cookie") ?? "";

    const headers: HeadersInit = {
      Accept: "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
      ...(cookie ? { cookie } : {}),
    };

    const jobRes = await fetch(`${API}/jobs/${encodeURIComponent(id)}`, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    const jobRaw = await jobRes.text();
    let job: Job | null = null;
    try {
      const parsed = jobRaw ? JSON.parse(jobRaw) : null;
      if (jobRes.ok && parsed?.id) job = parsed as Job;
    } catch { }

    if (!jobRes.ok || !job) {
      const msg = (() => {
        try {
          const parsed = jobRaw ? JSON.parse(jobRaw) : null;
          return parsed?.error || parsed?.message || `jobs_upstream_${jobRes.status}`;
        } catch {
          return `jobs_upstream_${jobRes.status}`;
        }
      })();
      return NextResponse.json({ job: null, company: null, error: msg }, { status: jobRes.status || 400 });
    }

    let company: { name?: string | null; profilePicture?: string | null; coverPhoto?: string | null; location?: string | null } | null = null;
    if (job.company_id) {
      try {
        const compRes = await fetch(`${API}/companies/${encodeURIComponent(job.company_id)}`, {
          method: "GET",
          headers,
          cache: "no-store",
        });
        if (compRes.ok) {
          const comp = (await compRes.json().catch(() => null)) as CompanyRaw | null;
          if (comp?.id) {
            company = {
              name: comp.name ?? null,
              profilePicture: comp.profile_picture ?? null,
              coverPhoto: comp.cover_photo ?? null,
              location: comp.location ?? null,
            };
          }
        }
      } catch { }
    }

    return NextResponse.json({ job, company }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { job: null, company: null, error: e?.message || "job_fetch_error" },
      { status: 500 }
    );
  }
}
