'use client';

import React, { useEffect, useMemo, useState } from 'react';
import styles from './completed.module.css';
import Link from 'next/link';
import { PropagateLoader } from 'react-spinners';

type JobMin = {
  id: string;
  company_id: string;
  title: string | null;
  location?: string | null;
  employment_type?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type CompanyMin = {
  id: string;
  name: string | null;
  location?: string | null;
  city?: string | null;
  profilePicture?: string | null;
  profile_picture?: string | null;
  logoUrl?: string | null;
  logo_url?: string | null;
  logo?: string | null;
  avatar?: string | null;
};

type Referral = {
  id: string;
  headhunter_id: string;
  candidate_id?: string | null;
  job_offer_id: string;
  referral_code: string | null;
  status: string;
  created_at: string;
  updated_at?: string | null;
};

type RefItem = { referral: Referral; jobOffer: JobMin | null; company: CompanyMin | null };

const FINAL_SET = new Set(['hired', 'rejected', 'declined_by_candidate']);

async function j<T = any>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { credentials: 'include', cache: 'no-store', ...init });
  const raw = await res.text();
  let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { }
  if (!res.ok) {
    const msg = data?.error || data?.message || raw || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

function initials(name?: string | null) {
  if (!name) return '•';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '•';
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
  switch ((s || '').toLowerCase()) {
    case 'hired': return css.pillOk;
    case 'rejected':
    case 'declined_by_candidate': return css.pillWarn;
    default: return css.pillMuted;
  }
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

function pickCompanyFromResponse(r: any): CompanyMin | null {
  const c = r?.company ?? r?.data ?? r ?? null;
  if (c && typeof c === 'object') return c as CompanyMin;
  return null;
}

export default function CompletedReferralsPage() {
  const [refs, setRefs] = useState<RefItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const me = await j<{ id?: string; user?: { id?: string } }>('/api/me');
        const candidateId = me?.id || me?.user?.id;
        if (!candidateId) throw new Error('No autorizado');

        const rdata = await j<any>(`/api/referrals?candidateId=${encodeURIComponent(candidateId)}&limit=200&offset=0`);
        const rawRefs: Referral[] = Array.isArray(rdata) ? rdata : rdata?.items ?? rdata ?? [];

        // Jobs
        const jobIds = Array.from(new Set(rawRefs.map((x) => x.job_offer_id)));
        const jobsMap: Record<string, JobMin | null> = {};
        const jobsResp = await Promise.all(jobIds.map(async (jid) => {
          try {
            const jd = await j<{ job?: JobMin; jobOffer?: JobMin }>(`/api/jobs/${encodeURIComponent(jid)}`);
            const job = (jd as any).job ?? (jd as any).jobOffer ?? jd ?? null;
            return { jid, job: job || null };
          } catch {
            return { jid, job: null };
          }
        }));
        for (const { jid, job } of jobsResp) jobsMap[jid] = job;

        // Companies by company_id
        const companyIds = Array.from(
          new Set(
            jobsResp.map(({ job }) => job?.company_id).filter(Boolean) as string[]
          )
        );

        const companyById: Record<string, CompanyMin | null> = {};
        await Promise.all(companyIds.map(async (cid) => {
          try {
            const c1 = await j<any>(`/api/company/${encodeURIComponent(cid)}`);
            const comp1 = pickCompanyFromResponse(c1);
            if (comp1) { companyById[cid] = comp1; return; }
          } catch { }
          try {
            const c2 = await j<any>(`/api/companies/${encodeURIComponent(cid)}`);
            const comp2 = pickCompanyFromResponse(c2);
            if (comp2) companyById[cid] = comp2;
          } catch { }
        }));

        const expanded: RefItem[] = rawRefs.map((ref) => {
          const jobOffer = jobsMap[ref.job_offer_id] ?? null;
          const company = jobOffer?.company_id ? (companyById[jobOffer.company_id] ?? null) : null;
          return { referral: ref, jobOffer, company };
        });

        if (!alive) return;
        setRefs(expanded);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || 'No se pudo cargar el historial');
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, []);

  const refsFinalized = useMemo(
    () => refs.filter(r => FINAL_SET.has((r.referral.status || '').toLowerCase())),
    [refs]
  );

  return (
    <div className={styles.page}>
      <div className={styles.main}>
        <header className={styles.pageHeader}>
          <h1 className={styles.title}>Procesos completados</h1>
          <p className={styles.subtitle}>Tu historial de referencias completadas.</p>
        </header>

        {err && <div className={styles.error}>{err}</div>}

        {loading && (
          <div className={styles.loading}><PropagateLoader /></div>
        )}

        {!loading && !err && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Referencias ({refsFinalized.length})</h2>

            {refsFinalized.length === 0 ? (
              <div className={styles.empty}>No tienes referencias finalizadas todavía.</div>
            ) : (
              <ul className={styles.list}>
                {refsFinalized.map(({ referral, jobOffer, company }) => {
                  const logo = companyLogo(company);
                  const closedAt = referral.updated_at || referral.created_at;
                  return (
                    <li className={styles.card} key={referral.id}>
                      <div className={styles.media}>
                        {logo ? (
                          <img className={styles.avatarImg} src={logo} alt={company?.name ?? 'Empresa'} loading="lazy" />
                        ) : (
                          <div className={styles.avatarFallback}>{initials(company?.name)}</div>
                        )}
                      </div>

                      <div className={styles.content}>
                        <div className={styles.rowTop}>
                          <div className={styles.companyBlock}>
                            <div className={styles.companyName}>{company?.name ?? 'Empresa'}</div>
                            <div className={styles.companySub}>{company?.location ?? company?.city ?? '—'}</div>
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

                          <div className={styles.actions}>
                            {jobOffer?.id && (
                              <Link className={styles.link} href={`/jobs/${jobOffer.id}`}>Ver oferta</Link>
                            )}
                          </div>

                          <span className={styles.date}>Cerrado el {new Date(closedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
