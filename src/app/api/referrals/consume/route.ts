import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  buildAuthHeader,
  resolveApiUrl,
  readJsonStrict,
} from "@/app/api/_utils/proxy-helpers";

async function readJson(res: Response) {
  const { data, raw } = await readJsonStrict(res);
  return { data, raw };
}

export async function POST(req: NextRequest) {
  const debugEnabled =
    req.headers.get("x-debug") === "1" ||
    req.nextUrl.searchParams.get("debug") === "1";

  const debug: string[] = [];

  const dlog = (...a: any[]) => {
    if (debugEnabled) {
      debug.push(a.map(String).join(" "));
    }
  };

  const derror = (...a: any[]) => {
    if (debugEnabled) {
      debug.push(
        "ERROR: " + a.map(String).join(" ")
      );
    }

    console.error(
      "[consume]",
      ...a
    );
  };

  try {
    const {
      jobOfferId,
      code,
      candidateId:
      candidateIdFromBody,
    } = (await req
      .json()
      .catch(
        () => ({})
      )) as {
        jobOfferId?: string;
        code?: string;
        candidateId?: string;
      };

    dlog(
      "Body:",
      JSON.stringify({
        jobOfferId,
        code,
        candidateIdFromBody,
      })
    );

    if (
      !jobOfferId ||
      !code
    ) {
      return NextResponse.json(
        {
          error:
            "jobOfferId_and_code_required",
          debug,
        },
        {
          status: 400,
        }
      );
    }

    const API =
      resolveApiUrl(req);

    const auth =
      buildAuthHeader(req);

    const cookie =
      req.headers.get(
        "cookie"
      ) ?? "";

    const baseHeaders: HeadersInit =
    {
      Accept:
        "application/json",
      "Content-Type":
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

    dlog(
      "Listando referrals por job:",
      jobOfferId
    );

    const listQs =
      new URLSearchParams({
        limit: "200",
        offset: "0",
        jobOfferId:
          String(
            jobOfferId
          ),
      });

    const listRes =
      await fetch(
        `${API}/referrals?${listQs.toString()}`,
        {
          method:
            "GET",
          headers:
            baseHeaders,
          cache:
            "no-store",
          credentials:
            "include",
        }
      );

    const {
      data: listData,
      raw: listRaw,
    } = await readJson(
      listRes
    );

    dlog(
      "LIST_REFERRALS RAW:",
      String(
        listRaw
      ).slice(0, 800)
    );

    if (!listRes.ok) {
      derror(
        "List referrals error:",
        listRes.status
      );

      return NextResponse.json(
        {
          error:
            "list_referrals_failed",
          details:
            listData?.error ||
            listData?.message ||
            null,
          debug,
        },
        {
          status:
            listRes.status ||
            500,
        }
      );
    }

    const target =
      String(code)
        .trim()
        .toUpperCase();

    const referrals: any[] =
      Array.isArray(
        listData
      )
        ? listData
        : listData?.items ??
        listData ??
        [];

    const found =
      referrals.find(
        (r) =>
          String(
            r.referral_code ||
            ""
          ).toUpperCase() ===
          target
      );

    dlog(
      "Referral encontrada:",
      JSON.stringify(
        found
      )
    );

    if (!found) {
      return NextResponse.json(
        {
          error:
            "referral_not_found_for_offer",
          debug,
        },
        {
          status: 404,
        }
      );
    }

    const meRes =
      await fetch(
        `${API}/auth/me`,
        {
          method:
            "GET",
          headers: {
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
          },
          cache:
            "no-store",
          credentials:
            "include",
        }
      );

    const {
      data: meData,
      raw: meRaw,
    } = await readJson(
      meRes
    );

    dlog(
      "/auth/me RAW:",
      String(
        meRaw
      ).slice(0, 800)
    );

    const meId:
      | string
      | undefined =
      meData?.id;

    const meRole =
      String(
        meData?.role ||
        ""
      ).toLowerCase();

    dlog(
      "User actual:",
      meId,
      "role:",
      meRole
    );

    if (!meId) {
      return NextResponse.json(
        {
          error:
            "unauthenticated",
          debug,
        },
        {
          status: 401,
        }
      );
    }

    let finalCandidateId:
      | string
      | null =
      null;

    if (
      meRole ===
      "candidate"
    ) {
      finalCandidateId =
        meId;

      dlog(
        "finalCandidateId <- meId (candidate)"
      );
    } else if (
      candidateIdFromBody
    ) {
      finalCandidateId =
        String(
          candidateIdFromBody
        );

      dlog(
        "finalCandidateId <- candidateIdFromBody"
      );
    } else {
      return NextResponse.json(
        {
          error:
            "candidate_id_required",
          debug,
        },
        {
          status: 400,
        }
      );
    }

    if (
      found.candidate_id &&
      found.candidate_id !==
      finalCandidateId
    ) {
      return NextResponse.json(
        {
          error:
            "referral_already_claimed_by_other",
          debug,
        },
        {
          status: 409,
        }
      );
    }

    const payload = {
      candidateId:
        finalCandidateId,
      status:
        "accepted_by_candidate",
    };

    const updRes =
      await fetch(
        `${API}/referrals/${encodeURIComponent(
          found.id
        )}`,
        {
          method:
            "PATCH",
          headers:
            baseHeaders,
          body: JSON.stringify(
            payload
          ),
          cache:
            "no-store",
          credentials:
            "include",
        }
      );

    const {
      data: updData,
      raw: updRaw,
    } = await readJson(
      updRes
    );

    dlog(
      "UPDATE RAW:",
      String(
        updRaw
      ).slice(0, 800)
    );

    if (!updRes.ok) {
      return NextResponse.json(
        {
          error:
            "update_referral_failed",
          details:
            updData,
          debug,
        },
        {
          status:
            updRes.status ||
            500,
        }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        referral:
          updData ?? null,
        debug,
      },
      {
        status: 200,
      }
    );
  } catch (e: any) {
    derror(
      "EXCEPTION:",
      e?.message ?? e
    );

    return NextResponse.json(
      {
        error:
          e?.message ??
          "consume_referral_failed",
        debug,
      },
      {
        status: 500,
      }
    );
  }
}