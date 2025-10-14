'use client';

import React, { useEffect, useMemo, useState } from 'react';
import styles from './applications.module.css';
import Link from 'next/link';
import { PropagateLoader } from 'react-spinners'; // ← loader

const AUTH_ME = `query { authMe { id email role } }`;

const APPLICATIONS_Q = `
  query Applications($jobOfferId: ID, $candidateId: ID, $limit: Int, $offset: Int) {
    applications(jobOfferId: $jobOfferId, candidateId: $candidateId, limit: $limit, offset: $offset) {
      id
      job_offer_id
      candidate_id
      accepted
      notes
      created_at
    }
  }
`;

const REFERRALS_BY_CANDIDATE = `
  query ReferralsByCandidate($candidateId: ID!, $limit: Int, $offset: Int, $status: String) {
    referralsByCandidate(candidateId: $candidateId, limit: $limit, offset: $offset, status: $status) {
      id
      headhunter_id
      candidate_id
      job_offer_id
      referral_code
      status
      created_at
      updated_at
    }
  }
`;

const JOB_BY_ID_MIN = `
  query JobById($id: ID!) {
    jobOffer(id: $id) {
      id
      company_id
      title
      location
      employment_type
      status
      created_at
    }
  }
`;

const GET_COMPANY_MIN = `
  query GetCompany($id: ID!) {
    company(id: $id) {
      id
      name
      profilePicture
      location
    }
  }
`;

type JobMin = {
  id: string; company_id: string; title: string;
  location?: string; employment_type?: string; status?: string; created_at?: string;
};
type CompanyMin = { id: string; name: string; profilePicture?: string | null; location?: string | null; };

type Application = {
  id: string; job_offer_id: string; candidate_id: string;
  accepted: boolean; notes?: string | null; created_at: string;
};
type Referral = {
  id: string; headhunter_id: string; candidate_id?: string | null;
  job_offer_id: string; referral_code: string; status: string; created_at: string;
};

type AppItem = { application: Application; jobOffer: JobMin | null; company: CompanyMin | null; };
type RefItem = { referral: Referral; jobOffer: JobMin | null; company: CompanyMin | null; };

async function gql<T = any>(query: string, variables?: any) {
  const res = await fetch('/api/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });
  const raw = await res.text();
  let data: any;
  try { data = raw ? JSON.parse(raw) : null; } catch { throw new Error(`GraphQL non-JSON: ${raw?.slice(0,200)}`); }
  if (!res.ok || data?.errors?.length) {
    const msg = data?.errors?.map((e: any) => e.message).join(' | ') || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data.data as T;
}

function initials(name?: string | null) {
  if (!name) return '•';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map(p => p[0]?.toUpperCase() ?? '').join('') || '•';
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

        const me = await gql<{ authMe: { id: string } | null }>(AUTH_ME);
        const candidateId = me?.authMe?.id;
        if (!candidateId) throw new Error('No autorizado');

        const [appsResp, refsResp] = await Promise.all([
          gql<{ applications: Application[] }>(APPLICATIONS_Q, { candidateId, limit: 50, offset: 0 }),
          gql<{ referralsByCandidate: Referral[] }>(REFERRALS_BY_CANDIDATE, { candidateId, limit: 50, offset: 0 }),
        ]);

        const applications = appsResp.applications ?? [];
        const referrals = refsResp.referralsByCandidate ?? [];

        const companyCache = new Map<string, CompanyMin | null>();

        const appsExpanded: AppItem[] = await Promise.all(
          applications.map(async (a) => {
            const j = await gql<{ jobOffer: JobMin | null }>(JOB_BY_ID_MIN, { id: a.job_offer_id });
            const jobOffer = j?.jobOffer ?? null;

            let company: CompanyMin | null = null;
            if (jobOffer?.company_id) {
              if (companyCache.has(jobOffer.company_id)) {
                company = companyCache.get(jobOffer.company_id) ?? null;
              } else {
                const c = await gql<{ company: CompanyMin | null }>(GET_COMPANY_MIN, { id: jobOffer.company_id });
                company = c?.company ?? null;
                companyCache.set(jobOffer.company_id, company);
              }
            }
            return { application: a, jobOffer, company };
          })
        );

        const refsExpanded: RefItem[] = await Promise.all(
          referrals.map(async (r) => {
            const j = await gql<{ jobOffer: JobMin | null }>(JOB_BY_ID_MIN, { id: r.job_offer_id });
            const jobOffer = j?.jobOffer ?? null;

            let company: CompanyMin | null = null;
            if (jobOffer?.company_id) {
              if (companyCache.has(jobOffer.company_id)) {
                company = companyCache.get(jobOffer.company_id) ?? null;
              } else {
                const c = await gql<{ company: CompanyMin | null }>(GET_COMPANY_MIN, { id: jobOffer.company_id });
                company = c?.company ?? null;
                companyCache.set(jobOffer.company_id, company);
              }
            }
            return { referral: r, jobOffer, company };
          })
        );

        if (!alive) return;
        setApps(appsExpanded);
        setRefs(refsExpanded);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || 'No se pudieron cargar tus postulaciones');
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, []);

  /** FILTROS solicitados:
   * - Applications: mostrar solo NO aceptadas (accepted === false)
   * - Referrals: mostrar solo las que NO están en 'hired'
   */
  const appsFiltered = useMemo(() => apps.filter(a => !a.application.accepted), [apps]);
  const refsFiltered = useMemo(() => refs.filter(r => (r.referral.status || '').toLowerCase() !== 'hired'), [refs]);

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
            <PropagateLoader />  {/* loader lindo */}
          </div>
        )}

        {!loading && !err && (
          <>
            {/* Intereses (Applications NO aceptadas) */}
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Ofertas a las que mostré interés</h2>
              {appsFiltered.length === 0 ? (
                <div className={styles.empty}>No tienes intereses pendientes.</div>
              ) : (
                <ul className={styles.list}>
                  {appsFiltered.map(({ application, jobOffer, company }) => (
                    <li className={styles.card} key={application.id}>
                      <div className={styles.media}>
                        {company?.profilePicture ? (
                          <img
                            className={styles.avatarImg}
                            src={company.profilePicture}
                            alt={company.name ?? 'Empresa'}
                            loading="lazy"
                          />
                        ) : (
                          <div className={styles.avatarFallback}>{initials(company?.name)}</div>
                        )}
                      </div>

                      <div className={styles.content}>
                        <div className={styles.rowTop}>
                          <div className={styles.companyBlock}>
                            <div className={styles.companyName}>{company?.name ?? 'Empresa'}</div>
                            <div className={styles.companySub}>{company?.location ?? '—'}</div>
                          </div>
                          <span className={`${styles.pill} ${styles.pillMuted}`}>Pendiente</span>
                        </div>

                        <div className={styles.jobBlock}>
                          <div className={styles.jobTitle}>{jobOffer?.title ?? 'Oferta'}</div>
                          <div className={styles.jobMeta}>
                            <span>{jobOffer?.location ?? '—'}</span>
                            <span>•</span>
                            <span>{jobOffer?.employment_type ?? '—'}</span>
                            <span>•</span>
                            <span className={`${styles.pill} ${styles.pillInfo}`}>{jobOffer?.status ?? '—'}</span>
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
                  ))}
                </ul>
              )}
            </section>

            {/* Estado (Referrals que NO están en 'hired') */}
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Estado de mis postulaciones</h2>
              {refsFiltered.length === 0 ? (
                <div className={styles.empty}>No tienes procesos activos.</div>
              ) : (
                <ul className={styles.list}>
                  {refsFiltered.map(({ referral, jobOffer, company }) => (
                    <li className={styles.card} key={referral.id}>
                      <div className={styles.media}>
                        {company?.profilePicture ? (
                          <img
                            className={styles.avatarImg}
                            src={company.profilePicture}
                            alt={company.name ?? 'Empresa'}
                            loading="lazy"
                          />
                        ) : (
                          <div className={styles.avatarFallback}>{initials(company?.name)}</div>
                        )}
                      </div>

                      <div className={styles.content}>
                        <div className={styles.rowTop}>
                          <div className={styles.companyBlock}>
                            <div className={styles.companyName}>{company?.name ?? 'Empresa'}</div>
                            <div className={styles.companySub}>{company?.location ?? '—'}</div>
                          </div>
                          <span className={`${styles.pill} ${statusClass(referral.status, styles)}`}>
                            {humanStatus(referral.status)}
                          </span>
                        </div>

                        <div className={styles.jobBlock}>
                          <div className={styles.jobTitle}>{jobOffer?.title ?? 'Oferta'}</div>
                          <div className={styles.jobMeta}>
                            <span>{jobOffer?.location ?? '—'}</span>
                            <span>•</span>
                            <span>{jobOffer?.employment_type ?? '—'}</span>
                            <span>•</span>
                            <span className={`${styles.pill} ${styles.pillInfo}`}>{jobOffer?.status ?? '—'}</span>
                          </div>
                        </div>

                        <div className={styles.rowBottom}>
                          <div className={styles.metaRow}>
                            <span className={styles.metaLabel}>Código:</span>
                            <span className={styles.mono}>{referral.referral_code ?? '—'}</span>
                          </div>
                          <span className={styles.date}>
                            Actualizado {new Date(referral.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function humanStatus(s?: string) {
  const map: Record<string, string> = {
    submitted: 'Enviado',
    accepted_by_candidate: 'Aceptado Por Candidato',
    declined_by_candidate: 'Rechazado Por Candidato',
    reviewing: 'En Revisión',
    rejected: 'Rechazado',
    shortlist: 'Shortlist',
    hired: 'Contratado',
  };
  return s ? (map[s] ?? s) : '—';
}
function statusClass(s?: string, css?: any) {
  switch (s) {
    case 'hired': return css.pillOk;            // aunque no las mostramos, dejo la clase por consistencia
    case 'shortlist':
    case 'reviewing': return css.pillInfo;
    case 'declined_by_candidate':
    case 'rejected': return css.pillWarn;
    default: return css.pillMuted;
  }
}
