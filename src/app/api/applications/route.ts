import { NextResponse } from "next/server";

/* ----------------- Tipos ----------------- */
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

/* ----------------- Helpers ----------------- */
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

function buildAuthHeader(req: Request): string | undefined {
  const h = req.headers.get("authorization");
  if (h && h.trim() !== "") return h;
  const cookieHeader = req.headers.get("cookie") ?? "";
  const token = getCookieValue(cookieHeader, "access_token");
  if (token && token.trim() !== "") return `Bearer ${token}`;
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

async function readJson(res: Response) {
  const ct = res.headers.get("content-type") || "";
  const txt = await res.text();
  if (ct.includes("application/json")) {
    try { return { data: txt ? JSON.parse(txt) : null, txt }; } catch { /* fallthrough */ }
  }
  return { data: null as any, txt };
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/* =========================================================
   GET /api/applications
   - Lista por jobOfferId (enriquece perfiles) o por candidateId
   ========================================================= */
export async function GET(req: Request) {
  try {
    const API = resolveApiUrl(req.url);
    const url = new URL(req.url);
    const jobOfferId = url.searchParams.get("jobOfferId") || undefined;
    const candidateId = url.searchParams.get("candidateId") || undefined;
    const limit = Number(url.searchParams.get("limit") ?? "20");
    const offset = Number(url.searchParams.get("offset") ?? "0");
    const accepted = url.searchParams.get("accepted") ?? undefined; // "true" | "false" | undefined

    if (!jobOfferId && !candidateId) {
      return jsonError("jobOfferId o candidateId es requerido", 400);
    }

    const auth = buildAuthHeader(req);
    const baseHeaders: HeadersInit = {
      accept: "application/json",
      ...(auth ? { Authorization: auth } : {}),
    };

    // 1) Intento moderno: POST /applications/search (si existiera)
    let list: ApplicationRow[] | null = null;
    try {
      const body: any = { jobOfferId, candidateId, limit, offset };
      if (accepted !== undefined) body.accepted = accepted; // string "true"/"false" si tu search lo soporta
      const r = await fetch(`${API}/applications/search`, {
        method: "POST",
        headers: { "content-type": "application/json", ...baseHeaders },
        body: JSON.stringify(body),
        cache: "no-store",
        redirect: "manual",
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
        return jsonError(msg, r.status || 500);
      }
    } catch { /* fallback */ }

    // 2) Fallback oficial de tu controller: GET /applications
    if (!list) {
      const qs = new URLSearchParams();
      if (candidateId) qs.set("candidateId", candidateId);
      if (jobOfferId) qs.set("jobOfferId", jobOfferId);
      if (accepted !== undefined) qs.set("accepted", accepted); // tu DTO usa IsBooleanString
      qs.set("limit", String(limit));
      qs.set("offset", String(offset));

      const r = await fetch(`${API}/applications?${qs.toString()}`, {
        method: "GET",
        headers: baseHeaders,
        cache: "no-store",
        redirect: "manual",
      });
      const { data, txt } = await readJson(r);
      if (!r.ok) {
        const msg = data?.error || data?.message || txt || "Error listando applications";
        return jsonError(msg, r.status || 500);
      }
      list = Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data)
          ? data
          : [];
    }

    // Enriquecimiento (solo cuando es por oferta)
    if (jobOfferId && !candidateId) {
      const ids = Array.from(new Set(list?.map(a => a.candidate_id))).filter(Boolean) as string[];
      if (ids.length === 0) {
        return NextResponse.json({ limit, offset, count: list?.length || 0, items: list, people: [] });
      }

      let profilesById = new Map<string, { name: string | null; photo: string | null; occupation: string | null; reputation: number | null }>();
      let batchOk = false;

      // Batch /profiles/search (si existe)
      try {
        const pr = await fetch(`${API}/profiles/search`, {
          method: "POST",
          headers: { "content-type": "application/json", ...baseHeaders },
          body: JSON.stringify({ ids, sortBy: "reputation", order: "desc", limit: ids.length }),
          cache: "no-store",
          redirect: "manual",
        });
        const { data } = await readJson(pr);
        if (pr.ok) {
          const listProfiles: Array<ProfileMini> =
            Array.isArray(data?.profiles) ? data.profiles :
              Array.isArray(data?.items) ? data.items :
                Array.isArray(data) ? data : [];
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

      if (!batchOk) {
        const results = await Promise.all(
          ids.map(async (id) => {
            try {
              const r = await fetch(`${API}/profiles/${encodeURIComponent(id)}`, {
                method: "GET",
                headers: baseHeaders,
                cache: "no-store",
                redirect: "manual",
              });
              const { data } = await readJson(r);
              if (!r.ok) throw new Error();
              const p: ProfileMini = data?.profile ?? data ?? {};
              return [id, {
                name: p?.full_name ?? null,
                photo: p?.profile_picture ?? null,
                occupation: p?.occupation ?? null,
                reputation: p?.reputation_score ?? null,
              }] as const;
            } catch {
              return [id, { name: null, photo: null, occupation: null, reputation: null }] as const;
            }
          })
        );
        profilesById = new Map(results);
      }

      const people = (list || []).map((a) => {
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
      people.sort((a, b) => (b.reputation ?? -1) - (a.reputation ?? -1));

      return NextResponse.json({ limit, offset, count: list?.length || 0, items: list, people });
    }

    return NextResponse.json({ limit, offset, count: list?.length || 0, items: list });
  } catch (err: any) {
    const msg = String(err?.message || "Error listando applications");
    if (msg.toLowerCase().includes("unauthorized")) return jsonError("No autorizado", 401);
    return jsonError(msg, 400);
  }
}

/* =========================================================
   POST /api/applications
   - Envia exactamente lo que exige tu CreateApplicationDto:
     { jobOfferId, candidateId, accepted:boolean, notes? }
   ========================================================= */
export async function POST(req: Request) {
  try {
    const API = resolveApiUrl(req.url);
    const bodyIn = await req.json().catch(() => ({}));
    const jobOfferId: string | undefined = bodyIn.jobOfferId || bodyIn.jobId;

    if (!jobOfferId) return jsonError("jobId es requerido", 400);

    const auth = buildAuthHeader(req);
    const baseHeaders: HeadersInit = {
      accept: "application/json",
      ...(auth ? { Authorization: auth } : {}),
    };

    // auth/me → obtener usuario (candidateId)
    const meRes = await fetch(`${API}/auth/me`, {
      method: "GET",
      headers: baseHeaders,
      cache: "no-store",
      redirect: "manual",
    });
    const { data: meData, txt: meTxt } = await readJson(meRes);
    if (!meRes.ok) {
      const msg = meData?.error || meData?.message || meTxt || "No autorizado";
      return jsonError(msg, 401);
    }
    const me = meData?.user ?? meData ?? {};
    const candidateId: string | undefined = me?.id || me?.user?.id;
    if (!candidateId) return jsonError("No autorizado", 401);

    // (Opcional) bloquear company_admin si así lo deseas:
    // const role = String(me?.role || me?.user?.role || "").toLowerCase();
    // if (role === "company_admin") return jsonError("Los company_admin no pueden aplicar a ofertas.", 403);

    // Enviar EXACTO DTO: CreateApplicationDto
    const payload = {
      jobOfferId,
      candidateId,
      accepted: false,                 // ✅ requerido por tu DTO
      notes: typeof bodyIn.notes === "string" ? bodyIn.notes : undefined,
    };

    const up = await fetch(`${API}/applications`, {
      method: "POST",
      headers: { "content-type": "application/json", ...baseHeaders },
      body: JSON.stringify(payload),
      cache: "no-store",
      redirect: "manual",
    });

    const { data, txt } = await readJson(up);

    if (up.status === 409) {
      const msg = data?.error || data?.message || "Application already exists";
      return jsonError(msg, 409);
    }
    if (up.status === 401) return jsonError("No autorizado", 401);
    if (!up.ok) {
      const msg = data?.error || data?.message || txt || "Error creando aplicación";
      return jsonError(msg, up.status || 500);
    }

    const app: ApplicationRow = data?.application ?? data;
    return NextResponse.json(app);
  } catch (err: any) {
    const msg = String(err?.message || "Error creando aplicación");
    if (msg.toLowerCase().includes("unauthorized")) return jsonError("No autorizado", 401);
    return jsonError(msg, 400);
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}
