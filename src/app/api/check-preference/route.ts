// /app/api/check-preference/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * Devuelve { status: 'approved' | 'pending' | 'rejected' | 'not_found', payment_id?: string }
 * Busca Merchant Orders por preference_id y deriva un estado.
 */
export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const prefId = url.searchParams.get('pref_id');
        if (!prefId) {
            return NextResponse.json({ error: 'pref_id requerido' }, { status: 400 });
        }

        const token = process.env.MP_ACCESS_TOKEN!;
        // Merchant Orders search por preference_id
        const moRes = await fetch(
            `https://api.mercadopago.com/merchant_orders/search?preference_id=${encodeURIComponent(prefId)}`,
            { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
        );

        const body = await moRes.json().catch(() => ({} as any));
        // Estructura típica: { elements: [ { payments: [ { status, id, ... } ], ... } ] }
        const order = Array.isArray(body?.elements) && body.elements.length ? body.elements[0] : null;
        if (!order) return NextResponse.json({ status: 'not_found' });

        // toma el pago más reciente (si hay varios)
        const pay = Array.isArray(order.payments) && order.payments.length
            ? order.payments.sort((a: any, b: any) => (b.date_created ?? 0) - (a.date_created ?? 0))[0]
            : null;

        if (!pay) return NextResponse.json({ status: 'pending' });

        // status puede ser: approved | pending | in_process | rejected | cancelled | ...
        const normalized =
            pay.status === 'approved' ? 'approved' :
                pay.status === 'rejected' ? 'rejected' :
                    'pending';

        return NextResponse.json({ status: normalized, payment_id: pay.id ?? null });
    } catch (e) {
        console.error('[check-preference] error:', e);
        return NextResponse.json({ error: 'fail' }, { status: 500 });
    }
}
