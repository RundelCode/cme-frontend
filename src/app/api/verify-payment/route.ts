// /app/api/verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { MercadoPagoConfig, Payment } from 'mercadopago';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
    const label = '[API /verify]';
    console.log(`\n===== ${label} START =====`);
    try {
        const { paymentId } = await req.json();
        if (!paymentId) {
            console.warn('Missing paymentId');
            console.log(`===== ${label} END =====\n`);
            return NextResponse.json({ error: 'paymentId requerido' }, { status: 400 });
        }

        console.log('Verifying paymentId:', paymentId);

        const client = new MercadoPagoConfig({
            accessToken: process.env.MP_ACCESS_TOKEN!,
            options: { timeout: 10000 },
        });
        const payment = new Payment(client);
        const resp = await payment.get({ id: paymentId });

        console.log('Payment.get response (sanitized):', {
            id: (resp as any)?.id,
            status: (resp as any)?.status,
            status_detail: (resp as any)?.status_detail,
        });

        console.log(`===== ${label} END =====\n`);
        return NextResponse.json({ id: (resp as any)?.id, status: (resp as any)?.status, status_detail: (resp as any)?.status_detail });
    } catch (e) {
        console.error('Error in /verify:', e);
        console.log(`===== ${label} END =====\n`);
        return NextResponse.json({ error: 'No se pudo verificar' }, { status: 500 });
    }
}
