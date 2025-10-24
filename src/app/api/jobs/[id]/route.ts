import { NextResponse } from "next/server";
import { gqlServer } from "../../../../../lib/gqlServer";
import { Company, getCompanyServer } from "../../../../../lib/company-server";
import { JOB_BY_ID } from "../../../../../lib/queries";

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

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;

    const data = await gqlServer<{ jobOffer: Job }>(JOB_BY_ID, { id });
    const job = data?.jobOffer ?? null;

    let company: Company | null = null;
    if (job?.company_id) {
      company = await getCompanyServer(job.company_id).catch(() => null);
    }


    return NextResponse.json({ job, company }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { job: null, company: null, error: e?.message || "job_fetch_error" },
      { status: 500 }
    );
  }
}
