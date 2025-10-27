// src/app/api/applications/route.ts
import { NextResponse } from "next/server";

type ApplicationRow = {
  id: string;
  job_offer_id: string;
  candidate_id: string;
  accepted: boolean;
  notes?: string | null;
  created_at: string;
};

type ProfileMini = {
  id?: string;
  full_name?: string | null;
  profile_picture?: string | null;
  occupation?: string | null;
  reputation_score?: number | null;
};

function getCookieValue(cookieHeader: string, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(/;\s*/);
  for (const p of parts) {
    const [k, ...rest] = p.split("=");
    if (k === name) {
      try { return decodeURIComponent(rest.join("=")); } catch { return rest.join("="); }
    }
  }
  return null;
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

async function readJson(res: Response) {
  const txt = await res.text();
  let data: any = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { /* ignore */ }
  return { data, txt };
}

export async function GET(req: Request) {
  try {
    const API = resolveApiUrl(req.url);
    const url = new URL(req.url);
    const jobOfferId = url.searchParams.get("jobOfferId") || undefined;
    const candidateId = url.searchParams.get("candidateId") || undefined;
    const limit = Number(url.searchParams.get("limit") ?? "20");
    const offset = Number(url.searchParams.get("offset") ?? "0");

    if (!jobOfferId && !candidateId) {
      return NextResponse.json(
        { error: "jobOfferId o candidateId es requerido" },
        { status: 400 }
      );
    }

    const cookieHeader = req.headers.get("cookie") ?? "";
    const access = getCookieValue(cookieHeader, "access_token") ?? "";
    const authHeaders = new Headers({
      accept: "application/json",
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
    });

    // 1) Intento: POST /applications/search (backend nuevo)
    let list: ApplicationRow[] | null = null;
    try {
      const body = { jobOfferId, candidateId, limit, offset };
      const r = await fetch(`${API}/applications/search`, {
        method: "POST",
        headers: new Headers({
          "content-type": "application/json",
          accept: "application/json",
          ...(access ? { Authorization: `Bearer ${access}` } : {}),
        }),
        body: JSON.stringify(body),
        cache: "no-store",
        credentials: "include",
      });
      const { data, txt } = await readJson(r);
      if (r.ok) {
        list = Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data)
            ? data
            : [];
      } else if (r.status !== 404 && r.status !== 405) {
        const msg = data?.error || data?.message || txt || "Error listando applications";
        return NextResponse.json({ error: msg }, { status: r.status });
      }
    } catch {
      /* cae al plan B */
    }

    // 2) Fallback: GET /applications?...
    if (!list) {
      const qs = new URLSearchParams();
      if (candidateId) qs.set("candidateId", candidateId);
      if (jobOfferId) qs.set("jobOfferId", jobOfferId);
      qs.set("limit", String(limit));
      qs.set("offset", String(offset));

      const r = await fetch(`${API}/applications?${qs.toString()}`, {
        headers: authHeaders,
        cache: "no-store",
      });
      const { data, txt } = await readJson(r);
      if (!r.ok) {
        const msg = data?.error || data?.message || txt || "Error listando applications";
        return NextResponse.json({ error: msg }, { status: r.status });
      }
      list = Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data)
          ? data
          : [];
    }

    // Si es list de interesados por oferta → enriquecer perfiles
    if (jobOfferId && !candidateId) {
      const ids = Array.from(new Set(list?.map((a) => a.candidate_id))).filter(Boolean) as string[];
      if (ids.length === 0) {
        return NextResponse.json({ limit, offset, count: list?.length, items: list, people: [] });
      }

      // Intento 1: batch /profiles/search
      let profilesById = new Map<
        string,
        { name: string | null; photo: string | null; occupation: string | null; reputation: number | null }
      >();
      let batchOk = false;
      try {
        const pr = await fetch(`${API}/profiles/search`, {
          method: "POST",
          headers: new Headers({
            "content-type": "application/json",
            accept: "application/json",
            ...(access ? { Authorization: `Bearer ${access}` } : {}),
          }),
          body: JSON.stringify({ ids, sortBy: "reputation", order: "desc", limit: ids.length }),
          cache: "no-store",
        });
        const { data } = await readJson(pr);
        if (pr.ok) {
          const listProfiles: Array<ProfileMini> = Array.isArray(data?.profiles)
            ? data.profiles
            : Array.isArray(data?.items)
              ? data.items
              : Array.isArray(data)
                ? data
                : [];
          profilesById = new Map(
            (listProfiles || []).map((p) => [
              String(p.id),
              {
                name: p.full_name ?? null,
                photo: p.profile_picture ?? null,
                occupation: p.occupation ?? null,
                reputation: p.reputation_score ?? null,
              },
            ])
          );
          batchOk = true;
        }
      } catch { /* fallback */ }

      // Intento 2: GET /profiles/:id
      if (!batchOk) {
        const results = await Promise.all(
          ids.map(async (id) => {
            try {
              const r = await fetch(`${API}/profiles/${encodeURIComponent(id)}`, {
                headers: authHeaders,
                cache: "no-store",
              });
              const { data } = await readJson(r);
              if (!r.ok) throw new Error();
              const p: ProfileMini = data?.profile ?? data ?? {};
              return [
                id,
                {
                  name: p?.full_name ?? null,
                  photo: p?.profile_picture ?? null,
                  occupation: p?.occupation ?? null,
                  reputation: p?.reputation_score ?? null,
                },
              ] as const;
            } catch {
              return [id, { name: null, photo: null, occupation: null, reputation: null }] as const;
            }
          })
        );
        profilesById = new Map(results);
      }

      const people = list?.map((a) => {
        const p = profilesById.get(a.candidate_id);
        return {
          profileId: a.candidate_id,
          name: p?.name ?? null,
          photo: p?.photo ?? null,
          occupation: p?.occupation ?? null,
          reputation: p?.reputation ?? null,
          appliedAt: a.created_at,
        };
      });
      people?.sort((a, b) => (b.reputation ?? -1) - (a.reputation ?? -1));

      return NextResponse.json({ limit, offset, count: list?.length, items: list, people });
    }

    // Caso candidato → devuelve items crudos normalizados
    return NextResponse.json({ limit, offset, count: list?.length, items: list });
  } catch (err: any) {
    const msg = String(err?.message || "Error listando applications");
    if (msg.toLowerCase().includes("unauthorized")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const API = resolveApiUrl(req.url);
    const { jobId, notes } = await req.json().catch(() => ({}));
    if (!jobId) {
      return NextResponse.json({ error: "jobId es requerido" }, { status: 400 });
    }

    const cookieHeader = req.headers.get("cookie") ?? "";
    const access = getCookieValue(cookieHeader, "access_token") ?? "";

    // /auth/me para obtener candidateId
    const meRes = await fetch(`${API}/auth/me`, {
      headers: new Headers({
        accept: "application/json",
        ...(access ? { Authorization: `Bearer ${access}` } : {}),
      }),
      cache: "no-store",
    });
    const { data: meData, txt: meTxt } = await readJson(meRes);
    if (!meRes.ok) {
      const msg = meData?.error || meData?.message || meTxt || "No autorizado";
      return NextResponse.json({ error: msg }, { status: 401 });
    }
    const me = meData?.user ?? meData ?? {};
    const candidateId = me?.id || me?.user?.id;
    if (!candidateId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    // Crear aplicación en backend
    const createRes = await fetch(`${API}/applications`, {
      method: "POST",
      headers: new Headers({
        "content-type": "application/json",
        accept: "application/json",
        ...(access ? { Authorization: `Bearer ${access}` } : {}),
      }),
      body: JSON.stringify({ job_offer_id: jobId, candidate_id: candidateId, notes }),
      cache: "no-store",
    });

    const { data, txt } = await readJson(createRes);

    if (createRes.status === 409) {
      const msg = data?.error || data?.message || "Ya aplicaste a esta oferta.";
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    if (createRes.status === 401) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (!createRes.ok) {
      const msg = data?.error || data?.message || txt || "Error creando aplicación";
      return NextResponse.json({ error: msg }, { status: createRes.status });
    }

    const app: ApplicationRow = data?.application ?? data;
    return NextResponse.json(app);
  } catch (err: any) {
    const msg = String(err?.message || "Error creando aplicación");
    if (msg.includes("already_applied")) {
      return NextResponse.json({ error: "Ya aplicaste a esta oferta." }, { status: 409 });
    }
    if (msg.toLowerCase().includes("unauthorized")) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
