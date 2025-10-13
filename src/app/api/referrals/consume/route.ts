// apps/web/app/api/referrals/consume/route.ts
import { NextRequest, NextResponse } from "next/server";

function resolveGraphqlUrl(req: NextRequest) {
  const env =
    process.env.GRAPHQL_URL ||
    process.env.NEXT_PUBLIC_GRAPHQL_URL ||
    "/api/graphql";
  if (env.startsWith("/")) return new URL(env, req.nextUrl.origin).toString();
  return env;
}

const LIST_REFERRALS = /* GraphQL */ `
  query ListReferrals($limit: Int!, $offset: Int!, $jobOfferId: ID, $status: String) {
    referrals(limit: $limit, offset: $offset, jobOfferId: $jobOfferId, status: $status) {
      id
      status
      referral_code
      headhunter_id
      job_offer_id
      created_at
    }
  }
`;

const UPDATE_REFERRAL = /* GraphQL */ `
  mutation UpdateReferral($id: ID!, $status: String!) {
    updateReferral(id: $id, status: $status) {
      id
      status
      referral_code
      updated_at
    }
  }
`;

const CREATE_REFERRAL = /* GraphQL */ `
  mutation CreateReferral(
    $headhunterId: ID!,
    $candidateId: ID!,
    $jobOfferId: ID!,
    $status: String
  ) {
    createReferral(
      headhunterId: $headhunterId,
      candidateId: $candidateId,
      jobOfferId: $jobOfferId,
      status: $status
    ) {
      id
      status
      referral_code
      candidate_id
      headhunter_id
      job_offer_id
      created_at
    }
  }
`;

export async function POST(req: NextRequest) {
  try {
    const { jobOfferId, code } = await req.json().catch(() => ({}));
    if (!jobOfferId || !code) {
      return NextResponse.json({ error: "jobOfferId_and_code_required" }, { status: 400 });
    }

    const url = resolveGraphqlUrl(req);

    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
    };
    const auth = req.headers.get("authorization");
    const cookie = req.headers.get("cookie");
    const xReqId = req.headers.get("x-request-id");
    const xCorrId = req.headers.get("x-correlation-id");
    if (auth) headers["authorization"] = auth;
    if (cookie) headers["cookie"] = cookie;
    if (xReqId) headers["x-request-id"] = xReqId as string;
    if (xCorrId) headers["x-correlation-id"] = xCorrId as string;

    // 1) Buscar la referencia de esta oferta
    const listRes = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: LIST_REFERRALS,
        variables: { limit: 200, offset: 0, jobOfferId, status: null },
        operationName: "ListReferrals",
      }),
      cache: "no-store",
    });

    const listRaw = await listRes.text();
    const listJson: any = (() => { try { return JSON.parse(listRaw); } catch { return null; } })();

    if (!listRes.ok) {
      return NextResponse.json(
        { error: `GraphQL HTTP ${listRes.status}`, details: listJson?.errors ?? null },
        { status: 502 },
      );
    }
    if (listJson?.errors?.length) {
      return NextResponse.json(
        { error: listJson.errors[0]?.message ?? "GraphQL error", details: listJson.errors },
        { status: 500 },
      );
    }

    const items: Array<{
      id: string; status: string; referral_code: string;
      headhunter_id: string; job_offer_id: string;
    }> = listJson?.data?.referrals ?? [];

    const target = String(code).trim().toUpperCase();
    const found = items.find(r => String(r.referral_code || "").toUpperCase() === target);

    if (!found) {
      return NextResponse.json({ error: "referral_not_found_for_offer" }, { status: 404 });
    }

    // 2) Obtener el user actual (para candidateId)
    const meRes = await fetch(new URL("/api/me", req.nextUrl).toString(), {
      method: "GET",
      headers: { cookie: cookie || "", authorization: auth || "" },
      cache: "no-store",
    });
    if (meRes.status !== 200) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const meJson = await meRes.json();
    const userId: string | undefined = meJson?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    // 3) Actualizar estado de la referencia original
    const updRes = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: UPDATE_REFERRAL,
        variables: { id: found.id, status: "accepted_by_candidate" },
        operationName: "UpdateReferral",
      }),
      cache: "no-store",
    });

    const updRaw = await updRes.text();
    const updJson: any = (() => { try { return JSON.parse(updRaw); } catch { return null; } })();
    if (!updRes.ok) {
      return NextResponse.json(
        { error: `GraphQL HTTP ${updRes.status}`, details: updJson?.errors ?? null },
        { status: 502 },
      );
    }
    if (updJson?.errors?.length) {
      return NextResponse.json(
        { error: updJson.errors[0]?.message ?? "GraphQL error", details: updJson.errors },
        { status: 500 },
      );
    }

    // 4) Crear referencia "espejo" con candidateId
    const crtRes = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: CREATE_REFERRAL,
        variables: {
          headhunterId: found.headhunter_id,
          candidateId: userId,
          jobOfferId: jobOfferId,
          status: "accepted_by_candidate",
        },
        operationName: "CreateReferral",
      }),
      cache: "no-store",
    });

    const crtRaw = await crtRes.text();
    const crtJson: any = (() => { try { return JSON.parse(crtRaw); } catch { return null; } })();
    if (!crtRes.ok) {
      // La creación "espejo" falló, pero el update de estado ya se hizo; devolvemos 200 con warning.
      return NextResponse.json(
        {
          ok: true,
          referral: updJson?.data?.updateReferral ?? null,
          warning: "mirror_create_failed",
          details: crtJson?.errors ?? null,
        },
        { status: 200 },
      );
    }
    if (crtJson?.errors?.length) {
      return NextResponse.json(
        {
          ok: true,
          referral: updJson?.data?.updateReferral ?? null,
          warning: "mirror_create_failed",
          details: crtJson?.errors,
        },
        { status: 200 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        referral: updJson?.data?.updateReferral ?? null,
        mirror: crtJson?.data?.createReferral ?? null,
      },
      { status: 200 },
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "consume_referral_failed" },
      { status: 500 },
    );
  }
}
