'use client';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function SuccessPage() {
    const params = useSearchParams();
    const paymentId = params.get('payment_id');
    const status = params.get('status');
    const merchantOrderId = params.get('merchant_order_id');

    // (Opcional) ejemplo de cómo harías verificación server-side
    const [serverCheck, setServerCheck] = useState<any>(null);
    useEffect(() => {
        const verify = async () => {
            if (!paymentId) return;
            try {
                const res = await fetch('/api/verify', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ paymentId }),
                });
                const data = await res.json();
                setServerCheck({ ok: res.ok, data });
            } catch (e) {
                console.error('verify error:', e);
            }
        };
        verify();
    }, [paymentId]);

    return (
        <main style={{ textAlign: 'center', marginTop: 80 }}>
            <h1>✅ Pago exitoso (callback)</h1>
            <p><b>payment_id:</b> {paymentId}</p>
            <p><b>status (query):</b> {status}</p>
            <p><b>merchant_order_id:</b> {merchantOrderId}</p>

            {serverCheck && (
                <div style={{ marginTop: 20 }}>
                    <h3>Verificación servidor</h3>
                    <pre style={{ textAlign: 'left', display: 'inline-block' }}>
                        {JSON.stringify(serverCheck, null, 2)}
                    </pre>
                </div>
            )}
        </main>
    );
}
