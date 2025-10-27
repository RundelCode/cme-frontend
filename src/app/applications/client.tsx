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
  try {
    data = txt ? JSON.parse(txt) : null;
  } catch { }
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

        const referredJobIds = new Set(referrals.map((r) => r.job_offer_id));
        const applications = applicationsRaw.filter((a) => !referredJobIds.has(a.job_offer_id));

        const jobCache = new Map<string, JobMin | null>();
        const companyCache = new Map<string, CompanyMin | null>();

        async function getJob(id: string): Promise<JobMin | null> {
          if (jobCache.has(id)) return jobCache.get(id) ?? null;
          try {
            const d = await j<{ job?: JobMin }>(`/api/jobs/${encodeURIComponent(id)}`);
            const job = d?.job ?? null;
            jobCache.set(id, job);
            return job;
          } catch {
            jobCache.set(id, null);
            return null;
          }
        }

        async function getCompany(id: string): Promise<CompanyMin | null> {
          if (companyCache.has(id)) return companyCache.get(id) ?? null;
          try {
            const d = await j<{ company?: CompanyMin }>(`/api/company/${encodeURIComponent(id)}`);
            const company = d?.company ?? null;
            companyCache.set(id, company);
            return company;
          } catch {
            companyCache.set(id, null);
            return null;
          }
        }

        const appsExpanded: AppItem[] = await Promise.all(
          applications.map(async (a) => {
            const jobOffer = await getJob(a.job_offer_id);
            const company = jobOffer?.company_id ? await getCompany(jobOffer.company_id) : null;
            return { application: a, jobOffer, company };
          })
        );

        const refsExpanded: RefItem[] = await Promise.all(
          referrals.map(async (r) => {
            const jobOffer = await getJob(r.job_offer_id);
            const company = jobOffer?.company_id ? await getCompany(jobOffer.company_id) : null;
            return { referral: r, jobOffer, company };
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
          <p className={styles.subtitle}>Tus intereses y el estado de tus referencias.</p>
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
                            <img
                              className={styles.avatarImg}
                              src={logo}
                              alt={company?.name ?? "Empresa"}
                              loading="lazy"
                            />
                          ) : (
                            <div className={styles.avatarFallback}>
                              {initials(company?.name)}
                            </div>
                          )}
                        </div>

                        <div className={styles.content}>
                          <div className={styles.rowTop}>
                            <div className={styles.companyBlock}>
                              <div className={styles.companyName}>{company?.name ?? "Empresa"}</div>
                              <div className={styles.companySub}>
                                {company?.location ?? company?.city ?? "—"}
                              </div>
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
                              <span className={`${styles.pill} ${styles.pillInfo}`}>
                                {jobOffer?.status ?? "—"}
                              </span>
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
              <h2 className={styles.sectionTitle}>Estado de mis postulaciones</h2>
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
                            <img
                              className={styles.avatarImg}
                              src={logo}
                              alt={company?.name ?? "Empresa"}
                              loading="lazy"
                            />
                          ) : (
                            <div className={styles.avatarFallback}>
                              {initials(company?.name)}
                            </div>
                          )}
                        </div>

                        <div className={styles.content}>
                          <div className={styles.rowTop}>
                            <div className={styles.companyBlock}>
                              <div className={styles.companyName}>{company?.name ?? "Empresa"}</div>
                              <div className={styles.companySub}>
                                {company?.location ?? company?.city ?? "—"}
                              </div>
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
                              <span className={`${styles.pill} ${styles.pillInfo}`}>
                                {jobOffer?.status ?? "—"}
                              </span>
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
