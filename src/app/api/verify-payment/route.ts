import { NextRequest, NextResponse } from 'next/server';
import { MercadoPagoConfig, Payment } from 'mercadopago';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
    const label = '[API /verify]';
    try {
        const { paymentId } = await req.json();
        if (!paymentId) {
            console.warn('Missing paymentId');
            return NextResponse.json({ error: 'paymentId requerido' }, { status: 400 });
        }

        const client = new MercadoPagoConfig({
            accessToken: process.env.MP_ACCESS_TOKEN!,
            options: { timeout: 10000 },
        });
        const payment = new Payment(client);
        const resp = await payment.get({ id: paymentId });


        return NextResponse.json({ id: (resp as any)?.id, status: (resp as any)?.status, status_detail: (resp as any)?.status_detail });
    } catch (e) {
        console.error('Error in /verify:', e);
        return NextResponse.json({ error: 'No se pudo verificar' }, { status: 500 });
    }
}
