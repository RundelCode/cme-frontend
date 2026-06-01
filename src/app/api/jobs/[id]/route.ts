import { NextRequest, NextResponse } from "next/server";
import {
  buildAuthHeader,
  resolveApiUrl,
  readJsonStrict,
} from "@/app/api/_utils/proxy-helpers";

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
  req: NextRequest,
  context: any
) {
  try {
    const id = context?.params?.id;

    if (!id) {
      return NextResponse.json(
        {
          job: null,
          company: null,
          error: "missing_job_id",
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
      req.headers.get("cookie") ?? "";

    const headers: HeadersInit = {
      Accept: "application/json",
      ...(authorization
        ? { Authorization: authorization }
        : {}),
      ...(cookie ? { cookie } : {}),
    };

    const jobRes = await fetch(
      `${API}/jobs/${encodeURIComponent(
        id
      )}`,
      {
        method: "GET",
        headers,
        cache: "no-store",
      }
    );

    let job: Job | null = null;

    try {
      const parsed =
        await readJsonStrict(jobRes);

      if (
        jobRes.ok &&
        parsed.data?.id
      ) {
        job =
          parsed.data as Job;
      }
    } catch { }

    if (!jobRes.ok || !job) {
      return NextResponse.json(
        {
          job: null,
          company: null,
          error: `jobs_upstream_${jobRes.status}`,
        },
        {
          status:
            jobRes.status || 400,
        }
      );
    }

    let company: {
      name?: string | null;
      profilePicture?:
      | string
      | null;
      coverPhoto?:
      | string
      | null;
      location?: string | null;
    } | null = null;

    if (job.company_id) {
      try {
        const compRes = await fetch(
          `${API}/companies/${encodeURIComponent(
            job.company_id
          )}`,
          {
            method: "GET",
            headers,
            cache: "no-store",
          }
        );

        if (compRes.ok) {
          const parsed =
            await readJsonStrict(
              compRes
            );

          const comp =
            parsed.data as
            | CompanyRaw
            | null;

          if (comp?.id) {
            company = {
              name:
                comp.name ??
                null,
              profilePicture:
                comp.profile_picture ??
                null,
              coverPhoto:
                comp.cover_photo ??
                null,
              location:
                comp.location ??
                null,
            };
          }
        }
      } catch { }
    }

    return NextResponse.json(
      {
        job,
        company,
      },
      {
        status: 200,
      }
    );
  } catch (e: any) {
    return NextResponse.json(
      {
        job: null,
        company: null,
        error:
          e?.message ||
          "job_fetch_error",
      },
      {
        status: 500,
      }
    );
  }
}