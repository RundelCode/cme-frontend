import { NextRequest, NextResponse } from "next/server";

function buildAuthHeader(req: NextRequest): string | undefined {
  const c = req.headers.get("cookie") ?? "";
  const read = (name: string) => {
    const m = c.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`, "i"));
    return m?.[1] ? decodeURIComponent(m[1]) : null;
  };

  const access = read("access_token") || read("sb-access-token");
  if (access && access.trim() !== "") return `Bearer ${access}`;

  const packed = read("supabase-auth-token");
  if (packed) {
    try {
      const parsed = JSON.parse(packed);
      if (Array.isArray(parsed) && typeof parsed[0] === "string" && parsed[0]) {
        return `Bearer ${parsed[0]}`;
      }
      if (parsed && typeof parsed === "object" && typeof (parsed as any).access_token === "string") {
        return `Bearer ${(parsed as any).access_token}`;
      }
    } catch { }
  }

  const h = req.headers.get("authorization");
  if (h && h.trim() !== "") return h;

  return undefined;
}


function resolveApiUrl(req: NextRequest) {
  const base =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_URL ||
    "http://localhost:3000/api";
  if (/^https?:\/\//i.test(base)) return base.replace(/\/$/, "");
  return new URL(base, req.nextUrl.origin).toString().replace(/\/$/, "");
}

async function readJson(res: Response) {
  const raw = await res.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    const e: any = new Error("upstream_not_json");
    e.__raw = raw?.slice(0, 800);
    throw e;
  }
  return { data, raw };
}

export async function POST(req: NextRequest) {
  const debugEnabled =
    req.headers.get("x-debug") === "1" ||
    req.nextUrl.searchParams.get("debug") === "1";

  const debug: string[] = [];
  const dlog = (...a: any[]) => {
    if (debugEnabled) debug.push(a.map(String).join(" "));
  };
  const derror = (...a: any[]) => {
    if (debugEnabled) debug.push("ERROR: " + a.map(String).join(" "));
    console.error("[consume]", ...a);
  };

  try {
    const { jobOfferId, code, candidateId: candidateIdFromBody } =
      (await req.json().catch(() => ({}))) as {
        jobOfferId?: string;
        code?: string;
        candidateId?: string;
      };

    dlog("Body:", JSON.stringify({ jobOfferId, code, candidateIdFromBody }));

    if (!jobOfferId || !code) {
      return NextResponse.json(
        { error: "jobOfferId_and_code_required", debug },
        { status: 400 }
      );
    }

    const API = resolveApiUrl(req);
    const auth = buildAuthHeader(req);
    const cookie = req.headers.get("cookie") ?? "";
    const baseHeaders: HeadersInit = {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(auth ? { Authorization: auth } : {}),
      ...(cookie ? { cookie } : {}),
    };

    dlog("Listando referrals por job:", jobOfferId);
    const listQs = new URLSearchParams({
      limit: "200",
      offset: "0",
      jobOfferId: String(jobOfferId),
    });
    const listRes = await fetch(`${API}/referrals?${listQs.toString()}`, {
      method: "GET",
      headers: baseHeaders,
      cache: "no-store",
      credentials: "include",
    });

    const { data: listData, raw: listRaw } = await readJson(listRes);
    dlog("LIST_REFERRALS RAW:", String(listRaw).slice(0, 800));
    if (!listRes.ok) {
      derror("List referrals error:", listRes.status);
      return NextResponse.json(
        {
          error: "list_referrals_failed",
          details: listData?.error || listData?.message || null,
          debug,
        },
        { status: listRes.status || 500 }
      );
    }

    const target = String(code).trim().toUpperCase();
    const referrals: any[] = Array.isArray(listData)
      ? listData
      : listData?.items ?? listData ?? [];
    const found = referrals.find(
      (r) => String(r.referral_code || "").toUpperCase() === target
    );
    dlog("Referral encontrada:", JSON.stringify(found));
    if (!found) {
      return NextResponse.json(
        { error: "referral_not_found_for_offer", debug },
        { status: 404 }
      );
    }

    const meRes = await fetch(`${API}/auth/me`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(auth ? { Authorization: auth } : {}),
        ...(cookie ? { cookie } : {}),
      },
      cache: "no-store",
      credentials: "include",
    });
    const { data: meData, raw: meRaw } = await readJson(meRes);
    dlog("/auth/me RAW:", String(meRaw).slice(0, 800));

    const meId: string | undefined = meData?.id;
    const meRole: string = String(meData?.role || "").toLowerCase();
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
      return NextResponse.json(
        { error: "candidate_id_required", debug },
        { status: 400 }
      );
    }

    if (found.candidate_id && found.candidate_id !== finalCandidateId) {
      dlog("Referral ya tomada por otro user:", found.candidate_id);
      return NextResponse.json(
        { error: "referral_already_claimed_by_other", debug },
        { status: 409 }
      );
    }

    const payload = {
      candidateId: finalCandidateId,
      status: "accepted_by_candidate",
    };
    dlog("PATCH /referrals/:id payload:", JSON.stringify(payload));
    const updRes = await fetch(`${API}/referrals/${encodeURIComponent(found.id)}`, {
      method: "PATCH",
      headers: baseHeaders,
      body: JSON.stringify(payload),
      cache: "no-store",
      credentials: "include",
    });

    const { data: updData, raw: updRaw } = await readJson(updRes);
    dlog("UPDATE RAW:", String(updRaw).slice(0, 800));

    if (!updRes.ok) {
      derror("Update referral error:", updRes.status);
      return NextResponse.json(
        { error: "update_referral_failed", details: updData, debug },
        { status: updRes.status || 500 }
      );
    }

    return NextResponse.json(
      { ok: true, referral: updData ?? null, debug },
      { status: 200 }
    );
  } catch (e: any) {
    derror("EXCEPTION:", e?.message ?? e);
    return NextResponse.json(
      { error: e?.message ?? "consume_referral_failed", debug },
      { status: 500 }
    );
  }
}
