// src/app/finance/page.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import styles from './finance.module.css';
import { PropagateLoader } from 'react-spinners';

type PaymentDirection = 'in' | 'out' | null;
type PaymentStatus = 'pending' | 'succeeded' | 'failed';

type Payment = {
    id: string;
    job_offer_id: string | null;
    headhunter_id: string | null;
    company_id: string;
    amount: number | string;
    currency: string;
    direction: PaymentDirection | string | null;
    psp_payment_id: string | null;
    status: PaymentStatus | string;
    created_at: string;
    updated_at: string | null;
};

type PaymentsResponse = { total: number; items: Payment[] };

function fmtMoney(amount?: number | string, currency?: string) {
    if (amount == null) return '-';
    const n = typeof amount === 'string' ? Number(amount) : amount;
    try {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: currency || 'USD',
            maximumFractionDigits: 2,
        }).format(n as number);
    } catch {
        return `${n} ${currency ?? ''}`;
    }
}

function directionLabel(d: PaymentDirection | string | null | undefined) {
    const v = (d ?? '').toString().toLowerCase();
    if (v === 'in') return 'Entrante';
    if (v === 'out') return 'Saliente';
    return '—';
}

function statusLabel(s: string | null | undefined) {
    switch ((s ?? '').toLowerCase()) {
        case 'pending':
            return 'Pendiente';
        case 'succeeded':
            return 'Completado';
        case 'failed':
            return 'Fallido';
        default:
            return s ?? '—';
    }
}

function getMonthRange(ym: string): { from: string; to: string } | null {
    const m = /^(\d{4})-(\d{2})$/.exec(ym);
    if (!m) return null;
    const y = Number(m[1]);
    const mon = Number(m[2]);
    if (mon < 1 || mon > 12) return null;
    const fromDate = new Date(Date.UTC(y, mon - 1, 1, 0, 0, 0, 0));
    const toDate = new Date(Date.UTC(y, mon, 0, 23, 59, 59, 999));
    return { from: fromDate.toISOString(), to: toDate.toISOString() };
}

export default function Page() {
    const [month, setMonth] = useState<string>('');
    const [status, setStatus] = useState<string>('');
    const [direction, setDirection] = useState<string>('');

    const [data, setData] = useState<PaymentsResponse | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [err, setErr] = useState<string | null>(null);

    const qs = useMemo(() => {
        const p = new URLSearchParams();
        if (month) {
            const range = getMonthRange(month);
            if (range) {
                p.set('from', range.from);
                p.set('to', range.to);
            }
        }
        if (status) p.set('status', status);
        if (direction) p.set('direction', direction);
        return p.toString();
    }, [month, status, direction]);

    async function fetchPayments() {
        setLoading(true);
        setErr(null);
        try {
            const url = qs ? `/api/finance?${qs}` : `/api/finance`;
            const res = await fetch(url, {
                method: 'GET',
                cache: 'no-store',
                credentials: 'include',
            });
            const text = await res.text();
            let json: any = null;
            try { json = text ? JSON.parse(text) : null; } catch { }
            if (!res.ok) {
                const isAuthErr = res.status === 401 || res.status === 403;
                const msg = isAuthErr
                    ? 'No autenticado. Inicia sesión para ver tus recibos.'
                    : (json?.error ?? 'Error al cargar pagos');
                throw new Error(msg);
            }
            const items: Payment[] = Array.isArray(json) ? json : (json?.items ?? []);
            const total = typeof json?.total === 'number'
                ? json.total
                : Array.isArray(json)
                    ? json.length
                    : items.length;
            setData({ total, items });
        } catch (e: any) {
            setErr(e?.message ?? 'Error inesperado');
            setData({ total: 0, items: [] });
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchPayments();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [qs]);

    const hasItems = (data?.items?.length ?? 0) > 0;

    return (
        <div className={styles.container}>
            <h1 className={styles.title}>Finanzas · Recibos de pago</h1>

            <div className={styles.filters}>
                <div className={styles.inputGroup}>
                    <label htmlFor="month">Mes</label>
                    <input
                        id="month"
                        type="month"
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                        className={styles.input}
                        placeholder="YYYY-MM"
                    />
                </div>

                <div className={styles.inputGroup}>
                    <label htmlFor="status">Estado</label>
                    <select
                        id="status"
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        className={styles.input}
                    >
                        <option value="">Todos</option>
                        <option value="pending">Pendiente</option>
                        <option value="succeeded">Completado</option>
                        <option value="failed">Fallido</option>
                    </select>
                </div>

                <div className={styles.inputGroup}>
                    <label htmlFor="direction">Operación</label>
                    <select
                        id="direction"
                        value={direction}
                        onChange={(e) => setDirection(e.target.value)}
                        className={styles.input}
                    >
                        <option value="">Todas</option>
                        <option value="in">Entrante</option>
                        <option value="out">Saliente</option>
                    </select>
                </div>
            </div>

            {loading ? (
                <div className={styles.loading}>
                    <PropagateLoader />
                </div>
            ) : err ? (
                <div className={styles.error}>Error: {err}</div>
            ) : !hasItems ? (
                <div className={styles.empty}>Aún no tienes recibos de pago.</div>
            ) : (
                <div className={styles.tableWrap}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>Operación</th>
                                <th>Monto</th>
                                <th>Estado</th>
                                <th>PSP ID</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data!.items.map((p) => {
                                const dir = (p.direction ?? null) as PaymentDirection | string | null;
                                const dirClass =
                                    (String(dir).toLowerCase() === 'in')
                                        ? styles.income
                                        : (String(dir).toLowerCase() === 'out')
                                            ? styles.outcome
                                            : '';
                                return (
                                    <tr key={p.id}>
                                        <td>{new Date(p.created_at).toLocaleString()}</td>
                                        <td className={dirClass}>{directionLabel(dir)}</td>
                                        <td>{fmtMoney(p.amount, p.currency)}</td>
                                        <td>{statusLabel(p.status as string)}</td>
                                        <td className={styles.psp}>{p.psp_payment_id ?? '-'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
