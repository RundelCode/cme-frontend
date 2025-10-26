// /app/api/create-preference/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';

function safeLen(v?: string) { return v ? `${v.length}` : '0'; }

export async function POST(req: NextRequest) {
    console.log('\n===== [API /create-preference] START =====');
    try {
        const accessToken = process.env.MP_ACCESS_TOKEN || '';
        console.log('Timestamp:', new Date().toISOString());
        console.log('Env MP_ACCESS_TOKEN length:', safeLen(accessToken));
        if (!accessToken) {
            return NextResponse.json({ error: 'Missing MP_ACCESS_TOKEN' }, { status: 500 });
        }

        // ⚠️ Comprador de prueba de CO distinto al vendedor
        const buyerEmail = 'test_user_XXXXXXXX@testuser.com';

        const payload = {
            items: [
                {
                    id: 'item-001',
                    title: 'Producto de prueba',
                    quantity: 1,
                    unit_price: 10000,
                    currency_id: 'COP', // Colombia
                },
            ],
            payer: { email: buyerEmail },
            back_urls: {
                success: 'http://localhost:3000/?status=success',
                failure: 'http://localhost:3000/?status=failure',
                pending: 'http://localhost:3000/?status=pending',
            },
        };

        console.log('Request body (sanitized):', {
            items: payload.items.map(({ id, title, quantity, unit_price, currency_id }) => ({ id, title, quantity, unit_price, currency_id })),
            payer: { email: payload.payer.email },
            back_urls: payload.back_urls,
        });

        const client = new MercadoPagoConfig({ accessToken, options: { timeout: 10_000 } });
        const preference = new Preference(client);

        const r = await preference.create({
            body: payload,
            requestOptions: { idempotencyKey: randomUUID() },
        });

        const init_point = (r as any)?.init_point || (r as any)?.sandbox_init_point || null;
        const preference_id = (r as any)?.id;

        console.log('SDK MP response:', { preference_id, init_point, site_id: (r as any)?.site_id });
        console.log('===== [API /create-preference] END =====\n');

        return NextResponse.json({ init_point, preference_id });
    } catch (err) {
        console.error('[MP create preference]', err);
        console.log('===== [API /create-preference] END =====\n');
        return NextResponse.json({ error: 'Error al crear la preferencia' }, { status: 500 });
    }
}
