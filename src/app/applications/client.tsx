// src/app/applications/Client.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import styles from "./applications.module.css";
import Link from "next/link";
import { PropagateLoader } from "react-spinners";

type JobMin = {
  id: string;
  company_id: string;
  title: string;
  location?: string | null;
  employment_type?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type CompanyMin = {
  id: string;
  name: string;
  profilePicture?: string | null;
  location?: string | null;
  profile_picture?: string | null;
  logoUrl?: string | null;
  logo_url?: string | null;
  logo?: string | null;
  avatar?: string | null;
  city?: string | null;
};

type Application = {
  id: string;
  job_offer_id: string;
  candidate_id: string;
  accepted: boolean;
  notes?: string | null;
  created_at: string;
};

type Referral = {
  id: string;
  headhunter_id: string;
  candidate_id?: string | null;
  job_offer_id: string;
  referral_code: string;
  status: string;
  created_at: string;
  updated_at?: string | null;
};

type AppItem = { application: Application; jobOffer: JobMin | null; company: CompanyMin | null };
type RefItem = { referral: Referral; jobOffer: JobMin | null; company: CompanyMin | null };

async function j<T = any>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { credentials: "include", cache: "no-store", ...init });
  const txt = await res.text();
  let data: any = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { }
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || txt || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

function initials(name?: string | null) {
  if (!name) return "•";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "•";
}

function companyLogo(c?: CompanyMin | null): string | null {
  if (!c) return null;
  return (
    c.profilePicture ??
    c.profile_picture ??
    c.logoUrl ??
    c.logo_url ??
    c.logo ??
    c.avatar ??
    null
  );
}

function humanStatus(s?: string) {
  const map: Record<string, string> = {
    submitted: "Enviado",
    accepted_by_candidate: "Aceptado Por Candidato",
    declined_by_candidate: "Rechazado Por Candidato",
    reviewing: "En Revisión",
    rejected: "Rechazado",
    shortlist: "Shortlist",
    hired: "Contratado",
  };
  return s ? map[s] ?? s : "—";
}

function statusClass(s?: string, css?: any) {
  switch (s) {
    case "hired":
      return css.pillOk;
    case "shortlist":
    case "reviewing":
      return css.pillInfo;
    case "declined_by_candidate":
    case "rejected":
      return css.pillWarn;
    default:
      return css.pillMuted;
  }
}

// ===== Helpers de normalización =====
function normalizeJob(job: any): JobMin | null {
  if (!job || typeof job !== "object") return null;
  const company_id = job.company_id ?? job.companyId ?? null;
  return {
    ...job,
    company_id: company_id == null ? undefined as any : String(company_id),
  } as JobMin;
}
function pickCompany(payload: any): CompanyMin | null {
  if (!payload || typeof payload !== "object") return null;
  const c = payload.company ?? payload.data ?? payload;
  if (c && typeof c === "object" && c.id) return c as CompanyMin;
  return null;
}

export default function Client() {
  const [apps, setApps] = useState<AppItem[]>([]);
  const [refs, setRefs] = useState<RefItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const me = await j<{ id?: string; user?: { id?: string } }>("/api/me");
        const candidateId = me?.id || me?.user?.id;
        if (!candidateId) throw new Error("No autorizado");

        console.debug("[applications] candidateId=", candidateId);

        const [appsResp, refsResp] = await Promise.all([
          j<{ items?: Application[]; count?: number }>(
            `/api/applications?candidateId=${encodeURIComponent(candidateId)}&limit=50&offset=0`
          ),
          j<{ items?: Referral[]; count?: number }>(
            `/api/referrals?candidateId=${encodeURIComponent(candidateId)}&limit=50&offset=0`
          ),
        ]);

        const applicationsRaw: Application[] = appsResp?.items ?? [];
        const referrals: Referral[] = refsResp?.items ?? [];
        console.debug("[applications] applicationsRaw=", applicationsRaw.length, "referrals=", referrals.length);

        const referredJobIds = new Set(referrals.map((r) => r.job_offer_id));
        const applications = applicationsRaw.filter((a) => !referredJobIds.has(a.job_offer_id));
        console.debug("[applications] apps after filter (not referred)=", applications.length);

        const jobCache = new Map<string, JobMin | null>();
        const companyCache = new Map<string, CompanyMin | null>();

        async function getJobAndMaybeCompany(id: string): Promise<{ job: JobMin | null; companyInline: CompanyMin | null }> {
          if (jobCache.has(id)) {
            const cached = jobCache.get(id) ?? null;
            // no podemos saber si había company inline en cache; igual devolvemos null para no romper
            return { job: cached, companyInline: null };
          }
          try {
            const d = await j<{ job?: JobMin; company?: CompanyMin }>(`/api/jobs/${encodeURIComponent(id)}`);
            const rawJob = (d as any)?.job ?? (d as any)?.jobOffer ?? d ?? null;
            const job = normalizeJob(rawJob);
            const inlineCompany = pickCompany(d);

            jobCache.set(id, job ?? null);

            if (inlineCompany?.id) {
              companyCache.set(inlineCompany.id, inlineCompany);
              console.debug("[applications] /api/jobs returned inline company for job", id, "companyId=", inlineCompany.id);
            } else {
              console.debug("[applications] /api/jobs NO inline company for job", id);
            }
            return { job, companyInline: inlineCompany ?? null };
          } catch (e: any) {
            console.warn("[applications] getJob fail:", id, e?.message);
            jobCache.set(id, null);
            return { job: null, companyInline: null };
          }
        }

        async function getCompanyByIdMaybeFetch(id: string | undefined | null): Promise<CompanyMin | null> {
          if (!id) return null;
          const key = String(id);
          if (companyCache.has(key)) return companyCache.get(key) ?? null;
          try {
            const d = await j<{ company?: CompanyMin }>(`/api/company/${encodeURIComponent(key)}`);
            const company = pickCompany(d);
            if (company?.id) {
              companyCache.set(company.id, company);
              return company;
            }
            companyCache.set(key, null);
            return null;
          } catch (e: any) {
            console.warn("[applications] getCompany fail:", key, e?.message);
            companyCache.set(key, null);
            return null;
          }
        }

        const appsExpanded: AppItem[] = await Promise.all(
          applications.map(async (a) => {
            const { job, companyInline } = await getJobAndMaybeCompany(a.job_offer_id);
            const cid = job?.company_id ?? (job as any)?.companyId;
            const company =
              companyInline ??
              (cid ? await getCompanyByIdMaybeFetch(cid) : null);

            if (!job?.company_id && (job as any)?.companyId) {
            }
            if (!company) {
            }
            return { application: a, jobOffer: job, company };
          })
        );

        const refsExpanded: RefItem[] = await Promise.all(
          referrals.map(async (r) => {
            const { job, companyInline } = await getJobAndMaybeCompany(r.job_offer_id);
            const cid = job?.company_id ?? (job as any)?.companyId;
            const company =
              companyInline ??
              (cid ? await getCompanyByIdMaybeFetch(cid) : null);

            if (!company) {
              console.debug("[applications][refs] company NOT resolved for jobOffer", r.job_offer_id, "cid=", cid);
            }
            return { referral: r, jobOffer: job, company };
          })
        );

        if (!alive) return;
        setApps(appsExpanded);
        setRefs(refsExpanded);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "No se pudieron cargar tus postulaciones");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const appsFiltered = useMemo(() => apps.filter((a) => !a.application.accepted), [apps]);

  const refsFiltered = useMemo(
    () => refs.filter((r) => (r.referral.status || "").toLowerCase() !== "hired"),
    [refs]
  );

  return (
    <div className={styles.page}>
      <div className={styles.main}>
        <header className={styles.pageHeader}>
          <h1 className={styles.title}>Mis postulaciones</h1>
        </header>

        {err && <div className={styles.error}>{err}</div>}

        {loading && (
          <div className={styles.loading}>
            <PropagateLoader />
          </div>
        )}

        {!loading && !err && (
          <>
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Ofertas a las que mostré interés</h2>
              {appsFiltered.length === 0 ? (
                <div className={styles.empty}>No tienes intereses pendientes.</div>
              ) : (
                <ul className={styles.list}>
                  {appsFiltered.map(({ application, jobOffer, company }) => {
                    const logo = companyLogo(company);
                    return (
                      <li className={styles.card} key={application.id}>
                        <div className={styles.media}>
                          {logo ? (
                            <img className={styles.avatarImg} src={logo} alt={company?.name ?? "Empresa"} loading="lazy" />
                          ) : (
                            <div className={styles.avatarFallback}>{initials(company?.name)}</div>
                          )}
                        </div>

                        <div className={styles.content}>
                          <div className={styles.rowTop}>
                            <div className={styles.companyBlock}>
                              <div className={styles.companyName}>{company?.name ?? "Empresa"}</div>
                              <div className={styles.companySub}>{company?.location ?? company?.city ?? "—"}</div>
                            </div>
                            <span className={`${styles.pill} ${styles.pillMuted}`}>Pendiente</span>
                          </div>

                          <div className={styles.jobBlock}>
                            <div className={styles.jobTitle}>{jobOffer?.title ?? "Oferta"}</div>
                            <div className={styles.jobMeta}>
                              <span>{jobOffer?.location ?? "—"}</span>
                              <span>•</span>
                              <span>{jobOffer?.employment_type ?? "—"}</span>
                              <span>•</span>
                              <span className={`${styles.pill} ${styles.pillInfo}`}>{jobOffer?.status ?? "—"}</span>
                            </div>
                          </div>

                          <div className={styles.rowBottom}>
                            <span className={styles.date}>
                              Postulé el {new Date(application.created_at).toLocaleDateString()}
                            </span>
                            {jobOffer?.id && (
                              <Link className={styles.link} href={`/jobs/${jobOffer.id}`}>
                                Ver oferta
                              </Link>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Estado de mis referencias</h2>
              {refsFiltered.length === 0 ? (
                <div className={styles.empty}>No tienes procesos activos.</div>
              ) : (
                <ul className={styles.list}>
                  {refsFiltered.map(({ referral, jobOffer, company }) => {
                    const logo = companyLogo(company);
                    return (
                      <li className={styles.card} key={referral.id}>
                        <div className={styles.media}>
                          {logo ? (
                            <img className={styles.avatarImg} src={logo} alt={company?.name ?? "Empresa"} loading="lazy" />
                          ) : (
                            <div className={styles.avatarFallback}>{initials(company?.name)}</div>
                          )}
                        </div>

                        <div className={styles.content}>
                          <div className={styles.rowTop}>
                            <div className={styles.companyBlock}>
                              <div className={styles.companyName}>{company?.name ?? "Empresa"}</div>
                              <div className={styles.companySub}>{company?.location ?? company?.city ?? "—"}</div>
                            </div>
                            <span className={`${styles.pill} ${statusClass(referral.status, styles)}`}>
                              {humanStatus(referral.status)}
                            </span>
                          </div>

                          <div className={styles.jobBlock}>
                            <div className={styles.jobTitle}>{jobOffer?.title ?? "Oferta"}</div>
                            <div className={styles.jobMeta}>
                              <span>{jobOffer?.location ?? "—"}</span>
                              <span>•</span>
                              <span>{jobOffer?.employment_type ?? "—"}</span>
                              <span>•</span>
                              <span className={`${styles.pill} ${styles.pillInfo}`}>{jobOffer?.status ?? "—"}</span>
                            </div>
                          </div>

                          <div className={styles.rowBottom}>
                            <div className={styles.metaRow}>
                              <span className={styles.metaLabel}>Código:</span>
                              <span className={styles.mono}>{referral.referral_code ?? "—"}</span>
                            </div>
                            <span className={styles.date}>
                              Actualizado {new Date(referral.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
