'use client';

import React, { useEffect, useMemo, useState } from 'react';
import styles from './active.module.css';
import { PropagateLoader } from 'react-spinners';

const AUTH_ME = `query { authMe { id email role } }`;

const REFERRALS_BY_HEADHUNTER = `
  query ReferralsByHeadhunter($headhunterId: ID!, $limit: Int, $offset: Int, $status: String) {
    referralsByHeadhunter(headhunterId: $headhunterId, limit: $limit, offset: $offset, status: $status) {
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

type Referral = {
    id: string;
    headhunter_id: string;
    candidate_id: string | null;
    job_offer_id: string;
    referral_code: string | null;
    status: string;
    created_at: string;
    updated_at: string | null;
};

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
    profilePicture?: string | null;
    location?: string | null;
};

type ProfileLite = {
    id: string;
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    profile_picture?: string | null;
};

async function gql<T = any>(query: string, variables?: any) {
    const res = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query, variables }),
        cache: 'no-store',
    });
    const raw = await res.text();
    let data: any;
    try {
        data = raw ? JSON.parse(raw) : null;
    } catch {
        throw new Error(`GraphQL non-JSON: ${raw?.slice(0, 200)}`);
    }
    if (!res.ok || data?.errors?.length) {
        const msg = data?.errors?.map((e: any) => e.message).join(' | ') || `HTTP ${res.status}`;
        throw new Error(msg);
    }
    return data.data as T;
}

function getDefaultMonth(): string {
    const d = new Date();
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

function getMonthRange(ym: string): { from: number; to: number } | null {
    const m = /^(\d{4})-(\d{2})$/.exec(ym);
    if (!m) return null;
    const y = Number(m[1]);
    const mon = Number(m[2]);
    if (mon < 1 || mon > 12) return null;
    const from = Date.UTC(y, mon - 1, 1, 0, 0, 0, 0);
    const to = Date.UTC(y, mon, 0, 23, 59, 59, 999);
    return { from, to };
}

function humanStatus(s?: string) {
    const map: Record<string, string> = {
        submitted: 'Enviado',
        accepted_by_candidate: 'Aceptado por candidato',
        declined_by_candidate: 'Rechazado por candidato',
        reviewing: 'En revisión',
        rejected: 'Rechazado',
        shortlist: 'Shortlist',
        hired: 'Contratado',
    };
    const k = (s || '').toLowerCase();
    return map[k] ?? (s || '—');
}

function statusClass(s?: string, css?: any) {
    switch ((s || '').toLowerCase()) {
        case 'hired':
            return css.pillOk;
        case 'rejected':
        case 'declined_by_candidate':
            return css.pillWarn;
        default:
            return css.pillMuted;
    }
}

function waLink(phone?: string | null, text?: string) {
    const msg = text || 'Hola, te referí a una vacante.';
    const digits = (phone || '').replace(/\D/g, '');
    if (digits) return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
    return `https://wa.me/?text=${encodeURIComponent(msg)}`;
}

function initials(name?: string | null) {
    if (!name) return '•';
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '•';
}

export default function MyReferralsPage() {
    const [month, setMonth] = useState<string>(getDefaultMonth());
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [items, setItems] = useState<Referral[]>([]);

    const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
    const [companies, setCompanies] = useState<Record<string, CompanyMin>>({});
    const [jobs, setJobs] = useState<Record<string, JobMin>>({});

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setLoading(true);
                setErr(null);

                const me = await gql<{ authMe: { id: string } | null }>(AUTH_ME);
                const headhunterId = me?.authMe?.id;
                if (!headhunterId) throw new Error('No autenticado');

                const r = await gql<{ referralsByHeadhunter: Referral[] }>(
                    REFERRALS_BY_HEADHUNTER,
                    { headhunterId, limit: 200, offset: 0 }
                );
                const refs = r?.referralsByHeadhunter ?? [];

                const jobIds = Array.from(new Set(refs.map((x) => x.job_offer_id)));
                const candIds = Array.from(
                    new Set(refs.map((x) => x.candidate_id).filter(Boolean))
                ) as string[];

                const companyCache = new Map<string, CompanyMin | null>();
                const jobsMap: Record<string, JobMin> = {};
                const companiesMap: Record<string, CompanyMin> = {};

                for (const jid of jobIds) {
                    try {
                        const j = await gql<{ jobOffer: JobMin | null }>(JOB_BY_ID_MIN, { id: jid });
                        const job = j?.jobOffer ?? null;
                        if (job) {
                            jobsMap[jid] = job;
                            if (job.company_id) {
                                if (companyCache.has(job.company_id)) {
                                    const c = companyCache.get(job.company_id);
                                    if (c) companiesMap[jid] = c;
                                } else {
                                    const c = await gql<{ company: CompanyMin | null }>(GET_COMPANY_MIN, {
                                        id: job.company_id,
                                    });
                                    const company = c?.company ?? null;
                                    companyCache.set(job.company_id, company);
                                    if (company) companiesMap[jid] = company;
                                }
                            }
                        }
                    } catch {
                    }
                }

                const profilesMap: Record<string, ProfileLite> = {};
                if (candIds.length) {
                    let loaded = false;

                    try {
                        const r1 = await fetch(`/api/profiles/batch`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ids: candIds }),
                        });
                        if (r1.ok) {
                            const j = await r1.json();
                            const arr: ProfileLite[] = j?.profiles ?? j ?? [];
                            for (const p of arr) profilesMap[p.id] = p;
                            loaded = true;
                        }
                    } catch { }

                    if (!loaded) {
                        try {
                            const q = encodeURIComponent(candIds.join(','));
                            const r0 = await fetch(`/api/profiles?ids=${q}`, { method: 'GET' });
                            if (r0.ok) {
                                const j = await r0.json();
                                const arr: ProfileLite[] = j?.profiles ?? j ?? [];
                                for (const p of arr) profilesMap[p.id] = p;
                                loaded = true;
                            }
                        } catch { }
                    }

                    if (!loaded) {
                        try {
                            const query = `
                query ProfilesByIds($ids: [ID!]!) {
                  profilesByIds(ids: $ids) {
                    id full_name email phone profile_picture
                  }
                }
              `;
                            const r2 = await fetch(`/api/graphql`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    query,
                                    variables: { ids: candIds },
                                    operationName: 'ProfilesByIds',
                                }),
                            });
                            const j2 = await r2.json();
                            const arr: ProfileLite[] = j2?.data?.profilesByIds ?? [];
                            for (const p of arr) profilesMap[p.id] = p;
                        } catch { }
                    }
                }

                if (!alive) return;
                setItems(refs);
                setJobs(jobsMap);
                setCompanies(companiesMap);
                setProfiles(profilesMap);
            } catch (e: any) {
                if (!alive) return;
                setErr(e?.message || 'No se pudo cargar tus referencias');
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => {
            alive = false;
        };
    }, []);

    const monthRange = useMemo(() => getMonthRange(month), [month]);
    const filtered = useMemo(() => {
        if (!monthRange) return items;
        const { from, to } = monthRange;
        return items.filter((r) => {
            const t = new Date(r.created_at).getTime();
            return t >= from && t <= to;
        });
    }, [items, monthRange]);

    return (
        <div className={styles.page}>
            <div className={styles.main}>
                <header className={styles.pageHeader}>
                    <h1 className={styles.title}>Mis referencias</h1>
                    <p className={styles.subtitle}>
                        Revisa el estado de tus referidos y contáctalos rápido.
                    </p>
                </header>

                {loading ? (
                    <div className={styles.loading}>
                        <PropagateLoader />
                    </div>
                ) : err ? (
                    <div className={styles.error}>Error: {err}</div>
                ) : filtered.length === 0 ? (
                    <div className={styles.empty}>Aún no tienes referencias en este período.</div>
                ) : (
                    <section className={styles.section}>
                        <h2 className={styles.sectionTitle}>
                            Referencias ({filtered.length})
                        </h2>

                        <ul className={styles.list}>
                            {filtered.map((r) => {
                                const job = jobs[r.job_offer_id];
                                const company = companies[r.job_offer_id];
                                const prof = r.candidate_id ? profiles[r.candidate_id] : undefined;

                                const emailHref = prof?.email ? `mailto:${prof.email}` : undefined;
                                const chatHref = waLink(
                                    prof?.phone,
                                    'Hola, te referí a una vacante.'
                                );

                                return (
                                    <li className={styles.card} key={r.id}>
                                        <div className={styles.media}>
                                            {company?.profilePicture ? (
                                                <img
                                                    className={styles.avatarImg}
                                                    src={company.profilePicture}
                                                    alt={company.name ?? 'Empresa'}
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
                                                    <div className={styles.companyName}>
                                                        {company?.name ?? 'Empresa'}
                                                    </div>
                                                    <div className={styles.companySub}>
                                                        {company?.location ?? '—'}
                                                    </div>
                                                </div>

                                                <span
                                                    className={`${styles.pill} ${statusClass(
                                                        r.status,
                                                        styles
                                                    )}`}
                                                >
                                                    {humanStatus(r.status)}
                                                </span>
                                            </div>

                                            <div className={styles.jobBlock}>
                                                <div className={styles.jobTitle}>
                                                    {job?.title ?? 'Oferta'}
                                                </div>
                                                <div className={styles.jobMeta}>
                                                    <span>{job?.location ?? '—'}</span>
                                                    <span>•</span>
                                                    <span>{job?.employment_type ?? '—'}</span>
                                                    <span>•</span>
                                                    <span className={`${styles.pill} ${styles.pillInfo}`}>
                                                        {job?.status ?? '—'}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className={styles.rowBottom}>
                                                <div className={styles.metaRow}>
                                                    <span className={styles.metaLabel}>Referido</span>
                                                    <span>
                                                        {prof?.full_name ??
                                                            (r.candidate_id
                                                                ? `ID ${r.candidate_id.slice(0, 8)}…`
                                                                : '—')}
                                                    </span>
                                                </div>

                                                <div className={styles.metaRow}>
                                                    <span className={styles.metaLabel}>Código</span>
                                                    <span className={styles.mono}>
                                                        {r.referral_code ?? '—'}
                                                    </span>
                                                </div>

                                                <div className={styles.metaRow} style={{ gap: 12 }}>
                                                    {emailHref ? (
                                                        <a className={styles.link} href={emailHref}>
                                                            Email
                                                        </a>
                                                    ) : (
                                                        <span className={styles.mono} style={{ opacity: .6 }}>
                                                            Email no disponible
                                                        </span>
                                                    )}
                                                    <span>•</span>
                                                    <a
                                                        className={styles.link}
                                                        href={chatHref}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                    >
                                                        Chatear
                                                    </a>
                                                </div>

                                                <span className={styles.date}>
                                                    Creado el{' '}
                                                    {new Date(r.created_at).toLocaleDateString()}
                                                </span>
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                )}
            </div>
        </div>
    );
}
