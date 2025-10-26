'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type Status = 'idle' | 'creating' | 'waiting' | 'approved' | 'rejected' | 'error';

export default function HomePage() {
  const [status, setStatus] = useState<Status>('idle');
  const [prefId, setPrefId] = useState<string | null>(null);
  const [lastPaymentId, setLastPaymentId] = useState<string | null>(null);

  // 👇 Cambia NodeJS.Timer por esto
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const searchParams = useSearchParams();

  useEffect(() => {
    const s = searchParams.get('status');
    if (s === 'success') setStatus('approved');
    else if (s === 'failure') setStatus('rejected');
    else if (s === 'pending') setStatus('waiting');
  }, [searchParams]);

  const startPolling = (preferenceId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/check-preference?pref_id=${encodeURIComponent(preferenceId)}`, { cache: 'no-store' });
        const data = await res.json();

        if (data?.payment_id) setLastPaymentId(String(data.payment_id));

        if (data.status === 'approved') {
          setStatus('approved');
          if (pollRef.current) clearInterval(pollRef.current);
        } else if (data.status === 'rejected') {
          setStatus('rejected');
          if (pollRef.current) clearInterval(pollRef.current);
        } else {
          setStatus('waiting');
        }
      } catch (e) {
        console.error(e);
      }
    }, 3000);
  };

  const handlePay = async () => {
    try {
      setStatus('creating');
      const res = await fetch('/api/create-preference', { method: 'POST' });
      const data = await res.json();

      if (!res.ok || !data?.init_point || !data?.preference_id) {
        console.error('Create preference resp:', data);
        setStatus('error');
        return;
      }

      setPrefId(data.preference_id);
      window.open(data.init_point, '_blank', 'noopener,noreferrer');
      startPolling(data.preference_id);
    } catch (e) {
      console.error(e);
      setStatus('error');
    }
  };

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // === Vistas ===
  if (status === 'approved') {
    return (
      <main style={{ textAlign: 'center', marginTop: 80 }}>
        <h1>✅ Pago acreditado</h1>
        {lastPaymentId && <p>payment_id: {lastPaymentId}</p>}
        <button onClick={() => { setStatus('idle'); setPrefId(null); setLastPaymentId(null); }}>
          Hacer otro pago
        </button>
      </main>
    );
  }

  if (status === 'rejected') {
    return (
      <main style={{ textAlign: 'center', marginTop: 80 }}>
        <h1>❌ Pago rechazado</h1>
        <button onClick={handlePay}>Reintentar</button>
      </main>
    );
  }

  if (status === 'waiting') {
    return (
      <main style={{ textAlign: 'center', marginTop: 80 }}>
        <h1>⌛ Esperando confirmación…</h1>
        <p>Referencia: {prefId}</p>
        {lastPaymentId && <p>payment_id: {lastPaymentId}</p>}
      </main>
    );
  }

  if (status === 'creating') {
    return (
      <main style={{ textAlign: 'center', marginTop: 80 }}>
        <h1>Creando preferencia…</h1>
      </main>
    );
  }

  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '70vh' }}>
      <button onClick={handlePay} style={{ padding: '10px 18px' }}>
        Pagar en nueva pestaña
      </button>
    </main>
  );
}
