'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import styles from './companyJobs.module.css';
import Link from 'next/link';
import { PropagateLoader } from 'react-spinners';

/* ====== FEE fijo (fallback cuando NO hay salario USD) ====== */
const FEE_COP = 10000;

/* ====== Tipado y cálculo de fee (tarifas USD) ====== */
type FeeQuote = { bracket: string; feeLabel: string; feeValue: number; feePercent?: number };
function computeCmeFeeUSD(salaryUSD: number): FeeQuote {
    if (!salaryUSD || salaryUSD <= 0) return { bracket: '—', feeLabel: '—', feeValue: 0 };
    if (salaryUSD <= 1000) return { bracket: '≤ 1,000', feeLabel: 'US$150', feeValue: 150 };
    if (salaryUSD <= 2500) return { bracket: '1,001–2,500', feeLabel: 'US$250', feeValue: 250 };
    if (salaryUSD <= 3500) return { bracket: '2,501–3,500', feeLabel: 'US$375', feeValue: 375 };
    if (salaryUSD <= 5000) return { bracket: '3,501–5,000', feeLabel: 'US$500', feeValue: 500 };
    return { bracket: '≥ 5,001', feeLabel: '12% del monto', feeValue: Math.round(salaryUSD * 0.12), feePercent: 12 };
}

/* ============== GQL helper ============== */
async function gql<T = any>(query: string, variables?: any) {
    const res = await fetch('/api/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query, variables }),
        cache: 'no-store',
        credentials: 'include',
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

/* ============== Queries/Mutations ============== */
const AUTH_ME = `query { authMe { id email role } }`;

const COMPANY_BY_ADMIN = `
  query ($adminId: ID!) {
    companyByAdmin(adminId: $adminId) {
      id
      name
      profilePicture
      location
    }
  }
`;

const MY_COMPANY_JOBS = `
  query MyCompanyJobs($input: JobSearchInput!, $limit: Int, $offset: Int) {
    jobSearch(input: $input, limit: $limit, offset: $offset) {
      total
      items {
        id
        title
        status
        created_at
        company_id
        location
        employment_type
        salary
        currency
      }
    }
  }
`;

const JOB_REFERRALS = `
  query JobWithReferrals($jobId: ID!, $limit: Int, $offset: Int) {
    jobOffer(id: $jobId) {
      id
      title
      status
    }
    referrals(jobOfferId: $jobId, limit: $limit, offset: $offset) {
      id
      status
      referral_code
      created_at
      candidate_id
      headhunter_id
      job_offer_id
    }
  }
`;

const UPDATE_REFERRAL_STATUS = `
  mutation UpdateReferralStatus($id: ID!, $status: String!) {
    updateReferralStatus(id: $id, status: $status) {
      id
      status
      updated_at
    }
  }
`;

const CREATE_PAYMENT = `
  mutation CreatePayment($input: CreatePaymentInput!) {
    createPayment(input: $input) {
      id
      amount
      currency
      status
      direction
      psp_payment_id
      company_id
      job_offer_id
      headhunter_id
    }
  }
`;

/* ====== Tipos ====== */
type AuthMe = { id: string; email?: string | null; role?: string | null };
type Company = { id: string; name: string; profilePicture?: string | null; location?: string | null };

type JobItem = {
    id: string;
    title: string;
    status?: string | null;
    created_at?: string | null;
    company_id: string;
    location?: string | null;
    employment_type?: string | null;
    salary?: number | null;
    currency?: string | null;
};
type JobSearchResp = { jobSearch: { total: number; items: JobItem[] } };

type ReferralRow = {
    id: string;
    status?: string | null;
    created_at?: string | null;
    referral_code?: string | null;
    candidate_id?: string | null;
    headhunter_id: string;
    job_offer_id: string;
};

/* === flujo progresivo (desde aceptada por el candidato) === */
const LINEAR_FLOW: string[] = [
    'accepted_by_candidate',
    'reviewing',
    'shortlist',
    'hired',
];

const TERMINALS = {
    declined_by_candidate: 'declined_by_candidate',
    rejected: 'rejected',
} as const;

/* ====== helpers UI ====== */
function humanStatus(s?: string | null) {
    if (!s) return '—';
    const map: Record<string, string> = {
        draft: 'Borrador',
        open: 'Abierta',
        paused: 'Pausada',
        closed: 'Cerrada',
    };
    return map[s] ?? s;
}

function humanReferralStatus(s?: string | null) {
    const map: Record<string, string> = {
        submitted: 'Enviado',
        accepted_by_candidate: 'Aceptado por el candidato',
        reviewing: 'En revisión',
        shortlist: 'Shortlist',
        hired: 'Contratado',
        rejected: 'Rechazado',
        declined_by_candidate: 'Rechazado por el candidato',
    };
    return s ? (map[s] ?? s) : '—';
}

/* ====== formateo de dinero genérico ====== */
function formatMoney(currency: string, amount: number) {
    const cur = (currency || 'USD').toUpperCase();
    try {
        const opts: Intl.NumberFormatOptions = { style: 'currency', currency: cur };
        if (cur === 'COP') opts.maximumFractionDigits = 0;
        return new Intl.NumberFormat('es-CO', opts).format(amount);
    } catch {
        return `${amount} ${cur}`;
    }
}

/* 📩 notificación (best-effort) */
async function createNotificationForCandidate({
    candidateId,
    jobTitle,
    newStatus,
    jobId
}: {
    candidateId: string;
    jobTitle: string;
    newStatus: string;
    jobId?: string;
}) {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(candidateId)) {
        console.warn('[notif] invalid candidateId, skipping', candidateId);
        return;
    }
    const rawTitle = `Actualización en tu proceso para "${jobTitle}"`;
    const rawMessage = `El estado de tu referencia ha cambiado a: ${humanReferralStatus(newStatus)}.`;
    const body = {
        userId: candidateId,
        title: rawTitle.slice(0, 180),
        message: rawMessage.slice(0, 5000),
        notificationType: 'recommendation',
        channel: 'system',
        relatedId: jobId ?? undefined,
    };
    try {
        const res = await fetch('/api/notifications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(body),
        });
        const txt = await res.text();
        let json: any; try { json = txt ? JSON.parse(txt) : null; } catch { json = txt; }
        if (!res.ok) {
            console.warn('[notif] create failed', res.status, json);
        } else {
            console.log('[notif] created', json);
        }
    } catch (e) {
        console.warn('[notif] create error', e);
    }
}

/* ===================== Estados de pago ===================== */
type PayStatus = 'idle' | 'creating' | 'waiting' | 'approved' | 'rejected' | 'error';
type PayDbStatus = 'idle' | 'saving' | 'ok' | 'failed';

export default function Client() {
    const [auth, setAuth] = useState<AuthMe | null>(null);
    const [company, setCompany] = useState<Company | null>(null);

    const [rows, setRows] = useState<JobItem[]>([]);
    const [total, setTotal] = useState(0);

    const [limit, setLimit] = useState(20);
    const [offset, setOffset] = useState(0);

    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    const isCompanyAdmin = (auth?.role ?? '').toLowerCase() === 'company_admin';

    const [modalOpen, setModalOpen] = useState(false);
    const [modalJob, setModalJob] = useState<JobItem | null>(null);
    const [modalLoading, setModalLoading] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);
    const [modalRefs, setModalRefs] = useState<ReferralRow[]>([]);
    const [modalPage, setModalPage] = useState(1);
    const MODAL_LIMIT = 10;

    const [expandedReferralId, setExpandedReferralId] = useState<string | null>(null);
    const [savingReferralId, setSavingReferralId] = useState<string | null>(null);

    const [payOpen, setPayOpen] = useState(false);
    const [payStatus, setPayStatus] = useState<PayStatus>('idle');
    const [payPrefId, setPayPrefId] = useState<string | null>(null);
    const [payPaymentId, setPayPaymentId] = useState<string | null>(null);
    const [payError, setPayError] = useState<string | null>(null);
    const [payForReferral, setPayForReferral] = useState<ReferralRow | null>(null);
    const [payForJob, setPayForJob] = useState<JobItem | null>(null);
    const [payDbStatus, setPayDbStatus] = useState<PayDbStatus>('idle');

    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Refs “frescos” para el polling
    const companyRef = useRef<Company | null>(null);
    const payForReferralRef = useRef<ReferralRow | null>(null);
    const payForJobRef = useRef<JobItem | null>(null);
    useEffect(() => { companyRef.current = company; }, [company]);
    useEffect(() => { payForReferralRef.current = payForReferral; }, [payForReferral]);
    useEffect(() => { payForJobRef.current = payForJob; }, [payForJob]);

    /* ====== bootstrap auth + company ====== */
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setLoading(true);
                setErr(null);

                const me = await gql<{ authMe: AuthMe | null }>(AUTH_ME);
                if (!me?.authMe?.id) throw new Error('No autenticado');
                setAuth(me.authMe);

                if ((me.authMe.role ?? '').toLowerCase() !== 'company_admin') {
                    throw new Error("Solo los usuarios con rol 'company_admin' pueden ver sus ofertas.");
                }

                const c = await gql<{ companyByAdmin: Company | null }>(COMPANY_BY_ADMIN, { adminId: me.authMe.id });
                const comp = c?.companyByAdmin ?? null;
                if (!comp?.id) throw new Error('No tienes una empresa asociada aún.');
                setCompany(comp);
            } catch (e: any) {
                if (!alive) return;
                setErr(e?.message || 'No autorizado');
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, []);

    /* ====== cargar ofertas ====== */
    useEffect(() => {
        let alive = true;
        if (!company?.id || !isCompanyAdmin) return;

        (async () => {
            try {
                setLoading(true);
                setErr(null);

                const resp = await gql<JobSearchResp>(MY_COMPANY_JOBS, {
                    input: { companyId: company.id },
                    limit,
                    offset,
                });

                if (!alive) return;
                setRows(resp?.jobSearch?.items ?? []);
                setTotal(resp?.jobSearch?.total ?? 0);
            } catch (e: any) {
                if (!alive) return;
                setErr(e?.message || 'No se pudieron cargar las ofertas');
            } finally {
                if (alive) setLoading(false);
            }
        })();

        return () => { alive = false; };
    }, [company?.id, isCompanyAdmin, limit, offset]);

    const page = useMemo(() => Math.floor(offset / limit) + 1, [offset, limit]);
    const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

    const canPrev = offset > 0;
    const canNext = offset + limit < total;

    /* ====== fee para una oferta ====== */
    function getFeeForJob(job?: JobItem | null): { amount: number; currency: string; label: string } {
        if (job?.salary && (job.currency ?? '').toUpperCase() === 'USD') {
            const q = computeCmeFeeUSD(job.salary);
            return { amount: q.feeValue, currency: 'USD', label: q.feeLabel };
        }
        // fallback: tarifa fija en COP
        return { amount: FEE_COP, currency: 'COP', label: formatMoney('COP', FEE_COP) };
    }

    /* ----- Modal handlers ----- */
    function openReferralsModal(job: JobItem) {
        setModalJob(job);
        setModalOpen(true);
        setModalError(null);
        setModalRefs([]);
        setModalPage(1);
        setExpandedReferralId(null);
    }

    function closeReferralsModal() {
        setModalOpen(false);
        setModalJob(null);
        setModalRefs([]);
        setModalError(null);
        setModalPage(1);
        setExpandedReferralId(null);
    }

    function modalGoToPage(p: number) {
        if (!modalJob) return;
        setExpandedReferralId(null);
        setModalPage(p);
    }

    /* ====== Cargar referidos cuando cambie el job/página ====== */
    useEffect(() => {
        if (!modalOpen || !modalJob?.id) return;

        let alive = true;
        const currentJobId = modalJob.id;
        const newOffset = (modalPage - 1) * MODAL_LIMIT;

        (async () => {
            try {
                setModalLoading(true);
                setModalError(null);

                const resp = await gql<{ referrals: ReferralRow[] }>(
                    JOB_REFERRALS,
                    { jobId: currentJobId, limit: MODAL_LIMIT, offset: newOffset }
                );

                if (!alive) return;

                let list = (resp?.referrals ?? []).filter(
                    r => (r.status ?? '').toLowerCase() !== 'submitted'
                );

                list = list.filter(r => (r.job_offer_id ?? '') === currentJobId);

                if (currentJobId !== modalJob.id) return;

                setModalRefs(list);

                if ((resp?.referrals?.length ?? 0) > 0 && list.length === 0) {
                    console.warn(
                        '[JOB_REFERRALS] backend devolvió referidos que no pertenecen.',
                        { requested: currentJobId, sample: resp?.referrals?.[0]?.job_offer_id }
                    );
                }
            } catch (e: any) {
                if (!alive) return;
                setModalError(e?.message || 'No se pudieron cargar los referidos');
            } finally {
                if (alive) setModalLoading(false);
            }
        })();

        return () => { alive = false; };
    }, [modalOpen, modalJob?.id, modalPage]);

    function linearIndex(status?: string | null) {
        const i = LINEAR_FLOW.indexOf((status ?? '').toLowerCase());
        return i < 0 ? 0 : i;
    }
    function isTerminal(status?: string | null) {
        const v = (status ?? '').toLowerCase();
        return v === TERMINALS.declined_by_candidate || v === TERMINALS.rejected;
    }

    /* ====== Pago / Hired ====== */
    function openPayModal(refRow: ReferralRow, job: JobItem) {
        console.log('[PAY][openPayModal]', { refRow, job });
        setPayForReferral(refRow);
        setPayForJob(job);
        setPayOpen(true);
        setPayStatus('idle');
        setPayPrefId(null);
        setPayPaymentId(null);
        setPayDbStatus('idle');
        setPayError(null);
    }

    function closePayModal() {
        setPayOpen(false);
        setPayForReferral(null);
        setPayForJob(null);
        setPayPrefId(null);
        setPayPaymentId(null);
        setPayStatus('idle');
        setPayDbStatus('idle');
        setPayError(null);
        if (pollRef.current) clearInterval(pollRef.current);
    }

    function startPolling(preferenceId: string) {
        if (pollRef.current) clearInterval(pollRef.current);
        console.log('[PAY][poll] start', { preferenceId });

        pollRef.current = setInterval(async () => {
            try {
                const res = await fetch(`/api/check-preference?pref_id=${encodeURIComponent(preferenceId)}`, { cache: 'no-store' });
                const data = await res.json().catch(() => ({} as any));
                console.log('[PAY][poll] tick', { ok: res.ok, data });

                if (data?.payment_id) {
                    setPayPaymentId(String(data.payment_id));
                }

                if (data.status === 'approved') {
                    console.log('[PAY][poll] approved ✅');
                    setPayStatus('approved');
                    if (pollRef.current) clearInterval(pollRef.current);

                    const freshReferral = payForReferralRef.current;
                    const freshJob = payForJobRef.current;
                    const freshCompany = companyRef.current;
                    const pspId = data?.payment_id ? String(data.payment_id) : (payPaymentId ?? null);

                    if (!freshReferral || !freshJob) {
                        console.warn('[PAY] Falta referral/job en approve', { freshReferral, freshJob });
                        return;
                    }

                    // 1) actualizar estado a hired
                    try {
                        console.log('[PAY] update referral -> hired', { referralId: freshReferral.id });
                        await gql(UPDATE_REFERRAL_STATUS, { id: freshReferral.id, status: 'hired' });

                        if (freshReferral.candidate_id && freshJob?.title) {
                            await createNotificationForCandidate({
                                candidateId: freshReferral.candidate_id,
                                jobTitle: freshJob.title,
                                newStatus: 'hired',
                                jobId: freshJob.id,
                            });
                        }

                        setModalRefs(prev => prev.map(r => r.id === freshReferral.id ? { ...r, status: 'hired' } : r));
                    } catch (e: any) {
                        console.error('[PAY] No se pudo actualizar la referencia a hired tras el pago:', e?.message || e);
                        setPayError('Pago aprobado, pero no se pudo actualizar la referencia. Intenta recargar.');
                    }

                    // 2) crear Payment en DB (best-effort)
                    const fee = getFeeForJob(freshJob);
                    if (!freshCompany?.id) {
                        console.warn('[PAY] No company.id disponible, no se creó Payment en DB');
                    } else {
                        try {
                            setPayDbStatus('saving');
                            console.log('[PAY] creating Payment via GQL…', {
                                companyId: freshCompany.id,
                                jobOfferId: freshJob?.id,
                                headhunterId: freshReferral?.headhunter_id,
                                amount: fee.amount,
                                currency: fee.currency,
                                direction: 'OUT',
                                pspPaymentId: pspId,
                            });

                            const resp = await gql(CREATE_PAYMENT, {
                                input: {
                                    jobOfferId: freshJob?.id ?? null,
                                    headhunterId: freshReferral?.headhunter_id ?? null,
                                    companyId: freshCompany.id,
                                    amount: fee.amount,
                                    currency: fee.currency,
                                    direction: 'OUT',
                                    pspPaymentId: pspId ?? undefined,
                                },
                            });
                            console.log('[PAY] createPayment resp:', resp);
                            setPayDbStatus('ok');
                        } catch (err: any) {
                            console.error('[PAY] createPayment ERROR:', err?.message || err);
                            setPayDbStatus('failed');
                        }
                    }
                } else if (data.status === 'rejected') {
                    console.log('[PAY][poll] rejected ❌');
                    setPayStatus('rejected');
                    if (pollRef.current) clearInterval(pollRef.current);
                } else {
                    setPayStatus('waiting');
                }
            } catch (e) {
                console.warn('[PAY][poll] error', e);
            }
        }, 3000);
    }

    async function beginPayment() {
        try {
            setPayError(null);
            setPayStatus('creating');
            console.log('[PAY][beginPayment] creando preferencia…');

            const fee = getFeeForJob(payForJob);
            const title =
                payForJob?.title
                    ? `Fee contratación: ${payForJob.title}`
                    : 'Fee contratación';

            // Enviamos amount/currency para que el backend de create-preference lo soporte cuando lo habilites
            const res = await fetch('/api/create-preference', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    amount: fee.amount,
                    currency: fee.currency,
                    title,
                }),
            });
            const data = await res.json().catch(() => ({} as any));
            console.log('[PAY][beginPayment] resp create-preference:', { ok: res.ok, data });

            if (!res.ok || !data?.init_point || !data?.preference_id) {
                setPayStatus('error');
                setPayError(data?.error || 'No se pudo crear la preferencia');
                return;
            }
            setPayPrefId(data.preference_id);
            setPayStatus('waiting');

            window.open(data.init_point, '_blank', 'noopener,noreferrer');

            startPolling(data.preference_id);
        } catch (e: any) {
            console.error('[PAY][beginPayment] error:', e);
            setPayStatus('error');
            setPayError(e?.message || 'Error iniciando el pago');
        }
    }

    async function setReferralStatus(referralId: string, newStatus: string) {
        try {
            if (newStatus.toLowerCase() === 'hired') {
                const ref = modalRefs.find(r => r.id === referralId);
                if (!ref || !modalJob) return;
                openPayModal(ref, modalJob);
                return;
            }

            setSavingReferralId(referralId);
            setModalRefs(prev => prev.map(r => r.id === referralId ? { ...r, status: newStatus } : r));
            await gql(UPDATE_REFERRAL_STATUS, { id: referralId, status: newStatus });

            const ref = modalRefs.find(r => r.id === referralId);
            if (ref?.candidate_id && modalJob?.title) {
                await createNotificationForCandidate({
                    candidateId: ref.candidate_id,
                    jobTitle: modalJob.title,
                    newStatus,
                    jobId: modalJob.id
                });
            }
        } catch (e: any) {
            setModalError(e?.message || 'No se pudo actualizar el estado');
        } finally {
            setSavingReferralId(null);
        }
    }

    return (
        <div className={styles.main}>
            <header className={styles.pageHeader}>
                <div>
                    <h1 className={styles.title}>Mis ofertas</h1>
                    <p className={styles.subtitle}>
                        {company?.name ? <>Empresa: <b>{company.name}</b></> : '—'}
                    </p>
                </div>
                <div className={styles.headerActions}>
                    <Link className={styles.primaryBtn} href="/jobs/new">+ Nueva oferta</Link>
                </div>
            </header>

            {err && <div className={styles.error}>{err}</div>}

            {loading ? (
                <div className={styles.loading}>
                    <PropagateLoader />
                </div>
            ) : rows.length === 0 ? (
                <div className={styles.empty}>
                    Aún no has publicado ofertas.
                    <div style={{ marginTop: 12 }}>
                        <Link className={styles.primaryBtn} href="/jobs/new">Crear primera oferta</Link>
                    </div>
                </div>
            ) : (
                <>
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Título</th>
                                    <th>Modalidad</th>
                                    <th>Ubicación</th>
                                    <th>Salario</th>
                                    <th>Estado</th>
                                    <th>Creada</th>
                                    <th style={{ textAlign: 'right' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(job => (
                                    <tr key={job.id} className={styles.row}>
                                        <td className={styles.jobTitleCell}>
                                            <Link href={`/jobs/${job.id}`} className={styles.link}>
                                                {job.title}
                                            </Link>
                                        </td>
                                        <td>{job.employment_type ?? '—'}</td>
                                        <td>{job.location ?? '—'}</td>
                                        <td>{job.salary ? `${job.salary} ${job.currency ?? 'USD'}` : '—'}</td>
                                        <td>
                                            <span className={`${styles.pill} ${pillClass(job.status, styles)}`}>
                                                {humanStatus(job.status)}
                                            </span>
                                        </td>
                                        <td>{job.created_at ? new Date(job.created_at).toLocaleDateString() : '—'}</td>
                                        <td className={styles.actionsCell}>
                                            <button className={styles.secBtn} onClick={() => openReferralsModal(job)}>
                                                Ver referidos
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={styles.pager}>
                        <button
                            className={styles.pagerBtn}
                            disabled={!canPrev}
                            onClick={() => canPrev && setOffset(Math.max(0, offset - limit))}
                        >
                            ← Anterior
                        </button>
                        <span className={styles.pagerInfo}>
                            Página {page} de {totalPages} • {total} resultados
                        </span>
                        <button
                            className={styles.pagerBtn}
                            disabled={!canNext}
                            onClick={() => canNext && setOffset(offset + limit)}
                        >
                            Siguiente →
                        </button>

                        <div className={styles.pageSize}>
                            <label>
                                Mostrar
                                <select
                                    className={styles.pageSizeSelect}
                                    value={limit}
                                    onChange={(e) => {
                                        const n = Number(e.currentTarget.value) || 20;
                                        setLimit(n);
                                        setOffset(0);
                                    }}
                                >
                                    <option value={10}>10</option>
                                    <option value={20}>20</option>
                                    <option value={50}>50</option>
                                </select>
                                {' '}por página
                            </label>
                        </div>
                    </div>
                </>
            )}

            {/* ===== Modal de Referidos ===== */}
            {modalOpen && (
                <div className={styles.modalOverlay} role="dialog" aria-modal="true" onClick={closeReferralsModal}>
                    <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <div className={styles.modalTitle}>
                                {modalJob?.title ?? 'Referidos'}
                            </div>
                            <button className={styles.modalClose} onClick={closeReferralsModal}>✕</button>
                        </div>

                        <div className={styles.modalBody}>
                            {modalError && <div className={styles.error}>{modalError}</div>}
                            {modalLoading ? (
                                <div className={styles.loading}>
                                    <PropagateLoader />
                                </div>
                            ) : modalRefs.length === 0 ? (
                                <div className={styles.empty}>Esta oferta no tiene referidos (aceptados) aún.</div>
                            ) : (
                                <ul className={styles.modalList}>
                                    {modalRefs.map((r) => {
                                        const v = (r.status ?? '').toLowerCase();
                                        const currentIdx = linearIndex(v);
                                        const terminal = isTerminal(v);

                                        return (
                                            <li key={r.id} className={styles.modalItem}>
                                                <div className={styles.modalItemMain}>
                                                    <div className={styles.modalItemTitle}>
                                                        {r.candidate_id ? `Candidato #${r.candidate_id.slice(0, 8)}` : 'Candidato'}
                                                    </div>
                                                    <div className={styles.modalItemSub}>
                                                        Código: <span className={styles.mono}>{r.referral_code ?? '—'}</span>
                                                    </div>
                                                </div>

                                                <div className={styles.modalItemMeta}>
                                                    <span className={`${styles.pill} ${styles.pillInfo}`}>{humanReferralStatus(r.status)}</span>
                                                    <span className={styles.modalItemDate}>
                                                        {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                                                    </span>
                                                </div>

                                                <div className={styles.modalItemActions}>
                                                    {r.candidate_id && (
                                                        <a
                                                            className={styles.secBtn}
                                                            href={`/profiles/users?id=${r.candidate_id}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                        >
                                                            Perfil candidato
                                                        </a>
                                                    )}
                                                    {r.headhunter_id && (
                                                        <a
                                                            className={styles.secBtn}
                                                            href={`/profiles/users?id=${r.headhunter_id}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                        >
                                                            Ver referidor
                                                        </a>
                                                    )}
                                                    <button
                                                        className={styles.primaryBtn}
                                                        onClick={() =>
                                                            setExpandedReferralId(expandedReferralId === r.id ? null : r.id)
                                                        }
                                                    >
                                                        {expandedReferralId === r.id ? 'Ocultar proceso' : 'Gestionar proceso'}
                                                    </button>
                                                </div>

                                                {expandedReferralId === r.id && (
                                                    <div className={styles.processPanel}>
                                                        <div className={styles.stepRow}>
                                                            {LINEAR_FLOW.map((step, idx) => {
                                                                const active = idx === currentIdx && !terminal;
                                                                const canClick = !terminal && idx === currentIdx + 1;
                                                                const isHiredStep = step === 'hired';
                                                                const disabled =
                                                                    terminal ||
                                                                    (idx !== currentIdx && idx !== currentIdx + 1) ||
                                                                    savingReferralId === r.id;

                                                                return (
                                                                    <button
                                                                        key={step}
                                                                        className={[
                                                                            styles.stepBtn,
                                                                            active ? styles.stepBtnActive : '',
                                                                            disabled ? styles.stepBtnDisabled : '',
                                                                        ].join(' ')}
                                                                        disabled={disabled}
                                                                        title={humanReferralStatus(step)}
                                                                        onClick={() => {
                                                                            if (!canClick) return;
                                                                            if (isHiredStep) {
                                                                                openPayModal(r, modalJob!);
                                                                            } else {
                                                                                setReferralStatus(r.id, step);
                                                                            }
                                                                        }}
                                                                    >
                                                                        {humanReferralStatus(step)}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>

                                                        <div className={styles.dangerRow}>
                                                            <button
                                                                className={styles.dangerBtn}
                                                                disabled={savingReferralId === r.id || v === 'hired' || terminal}
                                                                onClick={() => setReferralStatus(r.id, TERMINALS.rejected)}
                                                            >
                                                                Marcar “Rechazado”
                                                            </button>
                                                        </div>

                                                        {savingReferralId === r.id && (
                                                            <div className={styles.inlineSaving}>Guardando cambios…</div>
                                                        )}
                                                    </div>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>

                        <div className={styles.modalFooter}>
                            <button
                                className={styles.pagerBtn}
                                onClick={() => modalPage > 1 && modalGoToPage(modalPage - 1)}
                                disabled={modalPage <= 1 || modalLoading}
                            >
                                ← Anterior
                            </button>
                            <span className={styles.pagerInfo}>Página {modalPage}</span>
                            <button
                                className={styles.pagerBtn}
                                onClick={() => modalGoToPage(modalPage + 1)}
                                disabled={modalLoading}
                            >
                                Siguiente →
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== Modal de Pago ===== */}
            {payOpen && (
                <div
                    className={styles.modalOverlay}
                    role="dialog"
                    aria-modal="true"
                    style={{ zIndex: 9999, backdropFilter: 'blur(1px)' }}
                    onClick={closePayModal}
                >
                    <div className={styles.modalCard} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
                        <div className={styles.modalHeader}>
                            <div className={styles.modalTitle}>Confirmar contratación</div>
                            <button className={styles.modalClose} onClick={closePayModal}>✕</button>
                        </div>

                        <div className={styles.modalBody}>
                            {payStatus === 'idle' && (
                                <>
                                    <p style={{ marginBottom: 12 }}>
                                        Para marcar a este candidato como <b>Contratado</b>, la empresa debe pagar un fee.
                                    </p>

                                    {/* Mostrar el fee dinámico */}
                                    <div className={styles.infoBox} style={{ marginBottom: 12 }}>
                                        <div>Oferta: <b>{payForJob?.title ?? '—'}</b></div>
                                        <div>
                                            Fee a pagar:{' '}
                                            <b>
                                                {(() => {
                                                    const fee = getFeeForJob(payForJob);
                                                    // Si es USD, mostramos etiqueta de tramo; si es COP, mostramos formateado en COP
                                                    if ((payForJob?.currency ?? '').toUpperCase() === 'USD' && (payForJob?.salary ?? 0) > 0) {
                                                        const q = computeCmeFeeUSD(payForJob!.salary!);
                                                        return `${q.feeLabel} (${formatMoney('USD', q.feeValue)})`;
                                                    }
                                                    return formatMoney(fee.currency, fee.amount);
                                                })()}
                                            </b>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                                        <button className={styles.secBtn} onClick={closePayModal}>Cancelar</button>
                                        <button className={styles.primaryBtn} onClick={beginPayment}>Pagar</button>
                                    </div>
                                </>
                            )}

                            {payStatus === 'creating' && (
                                <div className={styles.loading} style={{ textAlign: 'center' }}>
                                    <PropagateLoader />
                                </div>
                            )}

                            {payStatus === 'waiting' && (
                                <div style={{ textAlign: 'center' }}>
                                    <h3>Esperando confirmación del pago…</h3>
                                    <p>Completa el pago en la pestaña que se abrió.</p>
                                    <div style={{ marginTop: 12 }}>
                                        <button className={styles.secBtn} onClick={closePayModal}>Cerrar</button>
                                    </div>
                                </div>
                            )}

                            {payStatus === 'approved' && (
                                <div style={{ textAlign: 'center' }}>
                                    <h3>Pago aprobado</h3>
                                    <div style={{ marginTop: 12 }}>
                                        {payDbStatus === 'saving' && <p>Registrando pago</p>}
                                        {payDbStatus === 'ok' && <p>Pago registrado</p>}
                                        {payDbStatus === 'failed' && (
                                            <p>No se pudo registrar el pago (ver consola).</p>
                                        )}
                                    </div>

                                    <p style={{ marginTop: 8 }}>La referencia fue marcada como <b>Contratado</b>.</p>
                                    <div style={{ marginTop: 12 }}>
                                        <button className={styles.primaryBtn} onClick={closePayModal}>Cerrar</button>
                                    </div>
                                </div>
                            )}

                            {payStatus === 'rejected' && (
                                <div style={{ textAlign: 'center' }}>
                                    <h3>Pago rechazado</h3>
                                    <p>No se aplicó el cambio de estado.</p>
                                    <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center' }}>
                                        <button className={styles.secBtn} onClick={closePayModal}>Cerrar</button>
                                        <button className={styles.primaryBtn} onClick={beginPayment}>Intentar de nuevo</button>
                                    </div>
                                </div>
                            )}

                            {payStatus === 'error' && (
                                <div style={{ textAlign: 'center' }}>
                                    <h3>Error</h3>
                                    <p>{payError ?? 'No se pudo iniciar el pago'}</p>
                                    <div style={{ marginTop: 12 }}>
                                        <button className={styles.secBtn} onClick={closePayModal}>Cerrar</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function pillClass(s?: string | null, css?: any) {
    const v = (s ?? '').toLowerCase();
    switch (v) {
        case 'open': return css.pillOk;
        case 'paused': return css.pillWarn;
        case 'closed': return css.pillMuted;
        default: return css.pillInfo;
    }
}
