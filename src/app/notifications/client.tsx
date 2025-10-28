'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './notifications.module.css';
import { PropagateLoader } from 'react-spinners';

type Notification = {
    id: string;
    user_id: string;
    title: string;
    message: string;
    notification_type: 'job_offer' | 'recommendation' | 'payment' | 'system_message';
    channel: 'email';
    status: 'queued' | 'sent' | 'failed';
    related_id?: string | null;
    read_at?: string | null;
    created_at: string;
    updated_at?: string | null;
};

export default function Client() {
    const [items, setItems] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    const [status, setStatus] = useState<string>('');
    const [notificationType, setNotificationType] = useState<string>('');
    const [limit, setLimit] = useState(25);
    const [offset, setOffset] = useState(0);

    const hasAutoMarked = useRef(false);

    async function load() {
        setLoading(true);
        setErr(null);

        const qs = new URLSearchParams({
            limit: String(limit),
            offset: String(offset),
            ...(status ? { status } : {}),
            ...(notificationType ? { notificationType } : {}),
        }).toString();

        const res = await fetch(`/api/notifications?${qs}`, { cache: 'no-store' });
        const raw = await res.text();

        let data: any = null;
        try { data = raw ? JSON.parse(raw) : null; } catch { }

        if (!res.ok) {
            setErr(data?.error || `HTTP ${res.status}`);
            setItems([]);
        } else {
            setItems(data?.items ?? []);
        }

        setLoading(false);
    }

    useEffect(() => {
        load();
    }, [limit, offset, status, notificationType]);

    const canPrev = offset > 0;
    const canNext = items.length >= limit;

    function humanType(t?: string) {
        switch (t) {
            case 'job_offer': return 'Oferta';
            case 'recommendation': return 'Recomendación';
            case 'payment': return 'Pago';
            case 'system_message': return 'Sistema';
            default: return t || '—';
        }
    }
    function humanStatus(s?: string) {
        switch (s) {
            case 'queued': return 'En cola';
            case 'sent': return 'Enviada';
            case 'failed': return 'Falló';
            default: return s || '—';
        }
    }

    function typeBadgeClass(t?: string) {
        switch (t) {
            case 'job_offer': return styles.typeJobOffer;
            case 'recommendation': return styles.typeRecommendation;
            case 'payment': return styles.typePayment;
            case 'system_message': return styles.typeSystem;
            default: return '';
        }
    }
    function statusPillClass(s?: string) {
        switch (s) {
            case 'queued': return styles.pillQueued;
            case 'sent': return styles.pillSent;
            case 'failed': return styles.pillFailed;
            default: return styles.pill;
        }
    }

    async function markRead(id: string) {
        const res = await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
        let data: any = null; try { data = await res.json(); } catch { }
        if (!res.ok) return;
        const readAt = data?.read_at ?? data?.notification?.read_at ?? new Date().toISOString();
        setItems(prev => prev.map(n => (n.id === id ? { ...n, read_at: readAt } : n)));
    }

    useEffect(() => {
        if (loading) return;
        if (hasAutoMarked.current) return;
        hasAutoMarked.current = true;

        const t = setTimeout(async () => {
            const unreadNow = items.filter(n => !n.read_at).map(n => n.id);
            if (!unreadNow.length) return;

            const batchSize = 8;
            for (let i = 0; i < unreadNow.length; i += batchSize) {
                const slice = unreadNow.slice(i, i + batchSize);
                await Promise.allSettled(slice.map(id => markRead(id)));
            }

            (async () => {
                const pageLimit = 200;
                let pageOffset = 0;
                for (let p = 0; p < 20; p++) {
                    const q = new URLSearchParams({ limit: String(pageLimit), offset: String(pageOffset) }).toString();
                    const r = await fetch(`/api/notifications?${q}`, { cache: 'no-store' });
                    const raw = await r.text();
                    let dj: any = null; try { dj = raw ? JSON.parse(raw) : null; } catch { }
                    const arr: Notification[] = Array.isArray(dj?.items) ? dj.items : [];
                    const unreadIds = arr.filter(n => !n.read_at).map(n => n.id);
                    if (unreadIds.length) {
                        for (let i = 0; i < unreadIds.length; i += batchSize) {
                            const sl = unreadIds.slice(i, i + batchSize);
                            await Promise.allSettled(sl.map(id => fetch(`/api/notifications/${id}/read`, { method: 'PATCH' })));
                        }
                    }
                    if (arr.length < pageLimit) break;
                    pageOffset += pageLimit;
                }
            })();
        }, 0);

        return () => clearTimeout(t);
    }, [loading, items]);

    return (
        <div className={styles.page}>
            <div className={styles.main}>
                <header className={styles.pageHeader}>
                    <h1 className={styles.title}>Notificaciones</h1>
                    <p className={styles.subtitle}>Todas las notificaciones que has recibido.</p>
                </header>

                <div className={styles.filters}>
                    <label className={styles.field}>
                        <span className={styles.label}>Estado</span>
                        <select
                            className={styles.select}
                            value={status}
                            onChange={e => { setOffset(0); setStatus(e.target.value); }}
                        >
                            <option value="">Todos</option>
                            <option value="queued">En cola</option>
                            <option value="sent">Enviadas</option>
                            <option value="failed">Falló</option>
                        </select>
                    </label>

                    <label className={styles.field}>
                        <span className={styles.label}>Tipo</span>
                        <select
                            className={styles.select}
                            value={notificationType}
                            onChange={e => { setOffset(0); setNotificationType(e.target.value); }}
                        >
                            <option value="">Todos</option>
                            <option value="job_offer">Oferta</option>
                            <option value="recommendation">Recomendación</option>
                            <option value="payment">Pago</option>
                            <option value="system_message">Sistema</option>
                        </select>
                    </label>
                </div>

                {err && <div className={styles.error}>{err}</div>}

                {loading ? (
                    <div className={styles.loading}><PropagateLoader /></div>
                ) : (
                    <>
                        {items.length === 0 ? (
                            <div className={styles.empty}>No hay notificaciones.</div>
                        ) : (
                            <ul className={styles.list}>
                                {items.map(n => {
                                    const unread = !n.read_at;
                                    return (
                                        <li
                                            key={n.id}
                                            className={`${styles.card} ${unread ? styles.cardUnread ?? '' : ''}`}
                                        >
                                            {unread ? <span className={styles.unreadDot ?? styles.hidden} /> : null}

                                            <div className={styles.content}>
                                                <div className={styles.rowTop}>
                                                    <div className={styles.leftBlock}>
                                                        <div className={styles.nTitle}>{n.title}</div>
                                                        <div className={`${styles.nMessage} ${styles.break}`}>{n.message}</div>
                                                    </div>

                                                    <div className={styles.metaRow}>
                                                        <span className={`${styles.typeBadge ?? styles.pill} ${typeBadgeClass(n.notification_type)}`}>
                                                            {humanType(n.notification_type)}
                                                        </span>
                                                        <span className={`${styles.pill} ${statusPillClass(n.status)}`}>
                                                            {humanStatus(n.status)}
                                                        </span>
                                                        <span className={styles.date}>{new Date(n.created_at).toLocaleString()}</span>
                                                    </div>
                                                </div>

                                                <div className={styles.metaRow}>
                                                    <span className={styles.metaItem}>
                                                        <span className={styles.metaKey}>Relacionado:</span>
                                                        {n.related_id ? <code className={styles.metaValue}>{n.related_id}</code> : '—'}
                                                    </span>
                                                    {n.read_at && (
                                                        <span className={styles.metaItem}>
                                                            <span className={styles.metaKey}>Leída:</span>
                                                            <span className={styles.date}>{new Date(n.read_at).toLocaleString()}</span>
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}

                        <div className={styles.pagination}>
                            <div className={styles.pageGroup}>
                                <button
                                    className={styles.pageBtn}
                                    disabled={!canPrev}
                                    onClick={() => setOffset(o => Math.max(0, o - limit))}
                                >
                                    Anterior
                                </button>
                                <span className={styles.pageLabel}>Offset {offset}</span>
                            </div>

                            <div className={styles.pageGroup}>
                                <label className={styles.fieldInline}>
                                    <span className={styles.label}>Por página</span>
                                    <select
                                        className={styles.pageSizeSelect}
                                        value={limit}
                                        onChange={e => { setOffset(0); setLimit(parseInt(e.target.value, 10) || 25); }}
                                    >
                                        <option value={10}>10</option>
                                        <option value={25}>25</option>
                                        <option value={50}>50</option>
                                    </select>
                                </label>
                                <button
                                    className={styles.pageBtn}
                                    disabled={!canNext}
                                    onClick={() => setOffset(o => o + limit)}
                                >
                                    Siguiente
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
