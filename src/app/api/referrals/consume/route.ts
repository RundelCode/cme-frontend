import { NextRequest, NextResponse } from "next/server";

function resolveGraphqlUrl(req: NextRequest) {
  const env =
    process.env.GRAPHQL_URL ||
    process.env.NEXT_PUBLIC_GRAPHQL_URL ||
    "/api/graphql";
  if (env.startsWith("/")) return new URL(env, req.nextUrl.origin).toString();
  return env;
}

const LIST_REFERRALS =`
  query ListReferrals($limit: Int!, $offset: Int!, $jobOfferId: ID, $status: String) {
    referrals(limit: $limit, offset: $offset, jobOfferId: $jobOfferId, status: $status) {
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

const UPDATE_REFERRAL =`
  mutation ClaimReferral($id: ID!, $candidateId: ID!, $status: String!) {
    updateReferral(id: $id, candidateId: $candidateId, status: $status) {
      id
      status
      candidate_id
      updated_at
    }
  }
`;

export async function POST(req: NextRequest) {
  const debugEnabled =
    req.headers.get("x-debug") === "1" ||
    req.nextUrl.searchParams.get("debug") === "1";

  const debug: string[] = [];
  const dlog = (...a: any[]) => { if (debugEnabled) debug.push(a.map(String).join(" "));};
  const derror = (...a: any[]) => { if (debugEnabled) debug.push("ERROR: " + a.map(String).join(" ")); console.error("[consume]", ...a); };

  try {
    const { jobOfferId, code, candidateId: candidateIdFromBody } = await req.json().catch(() => ({}));
    dlog("Body:", JSON.stringify({ jobOfferId, code, candidateIdFromBody }));

    if (!jobOfferId || !code) {
      return NextResponse.json({ error: "jobOfferId_and_code_required", debug }, { status: 400 });
    }

    const url = resolveGraphqlUrl(req);
    dlog("GraphQL URL:", url);

    const auth = req.headers.get("authorization") ?? "";
    const cookie = req.headers.get("cookie") ?? "";
    const baseHeaders: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
    };
    if (auth) baseHeaders["authorization"] = auth;
    if (cookie) baseHeaders["cookie"] = cookie;

    dlog("Listando referrals por job:", jobOfferId);
    const listRes = await fetch(url, {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify({
        query: LIST_REFERRALS,
        variables: { limit: 200, offset: 0, jobOfferId, status: null },
        operationName: "ListReferrals",
      }),
      cache: "no-store",
    });

    const listRaw = await listRes.text();
    dlog("LIST_REFERRALS RAW:", listRaw.slice(0, 800));
    const listJson: any = (() => { try { return JSON.parse(listRaw); } catch { return null; } })();
    if (!listRes.ok || listJson?.errors?.length) {
      derror("List referrals error:", listJson?.errors);
      return NextResponse.json({ error: "list_referrals_failed", details: listJson?.errors, debug }, { status: 500 });
    }

    const target = String(code).trim().toUpperCase();
    const referrals: any[] = listJson?.data?.referrals ?? [];
    const found = referrals.find(r => String(r.referral_code || "").toUpperCase() === target);
    dlog("Referral encontrada:", JSON.stringify(found));
    if (!found) {
      return NextResponse.json({ error: "referral_not_found_for_offer", debug }, { status: 404 });
    }

    const meUrl = new URL("/api/me", req.nextUrl.origin).toString();
    dlog("Consultando /api/me:", meUrl);
    const meRes = await fetch(meUrl, { method: "GET", headers: { cookie, authorization: auth }, cache: "no-store" });
    const meRaw = await meRes.text();
    dlog("/api/me RAW:", meRaw.slice(0, 800));
    const meJson: any = (() => { try { return JSON.parse(meRaw); } catch { return null; } })();

    const meId: string | undefined = meJson?.user?.id;
    const meRole: string = (meJson?.user?.role ?? "").toLowerCase();
    dlog("User actual:", meId, "role:", meRole);

    if (!meId) {
      return NextResponse.json({ error: "unauthenticated", debug }, { status: 401 });
    }

    let finalCandidateId: string | null = null;
    if (meRole === "candidate") {
      finalCandidateId = meId;                     
      dlog("finalCandidateId <- meId (candidate)");
    } else if (candidateIdFromBody) {
      finalCandidateId = String(candidateIdFromBody);
      dlog("finalCandidateId <- candidateIdFromBody");
    } else {
      dlog("No candidateId disponible (ni role candidate ni candidateId en body)");
      return NextResponse.json({ error: "candidate_id_required", debug }, { status: 400 });
    }

    if (found.candidate_id && found.candidate_id !== finalCandidateId) {
      dlog("Referral ya tomada por otro user:", found.candidate_id);
      return NextResponse.json({ error: "referral_already_claimed_by_other", debug }, { status: 409 });
    }

    const variables = { id: found.id, candidateId: finalCandidateId, status: "accepted_by_candidate" };
    dlog("UPDATE_REFERRAL variables:", JSON.stringify(variables));

    const updRes = await fetch(url, {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify({
        query: UPDATE_REFERRAL,
        variables,
        operationName: "ClaimReferral",
      }),
      cache: "no-store",
    });

    const updRaw = await updRes.text();
    dlog("UPDATE_REFERRAL RAW:", updRaw.slice(0, 800));
    const updJson: any = (() => { try { return JSON.parse(updRaw); } catch { return null; } })();

    if (!updRes.ok || updJson?.errors?.length) {
      derror("Update referral error:", updJson?.errors);
      return NextResponse.json({ error: "update_referral_failed", details: updJson?.errors, debug }, { status: 500 });
    }

    dlog("OK updateReferral:", JSON.stringify(updJson?.data?.updateReferral));
    return NextResponse.json({ ok: true, referral: updJson?.data?.updateReferral ?? null, debug }, { status: 200 });
  } catch (e: any) {
    derror("EXCEPTION:", e?.message ?? e);
    return NextResponse.json({ error: e?.message ?? "consume_referral_failed", debug }, { status: 500 });
  }
}
