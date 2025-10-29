import { NextRequest, NextResponse } from 'next/server';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';

function toUpper(s?: string) {
  return (s ?? '').toString().trim().toUpperCase();
}

export async function POST(req: NextRequest) {
  try {
    const accessToken = process.env.MP_ACCESS_TOKEN || '';
    if (!accessToken) {
      return NextResponse.json({ error: 'Missing MP_ACCESS_TOKEN' }, { status: 500 });
    }

    const body = await req.json().catch(() => ({} as any));
    const rawAmount = Number(body?.amount);
    const rawCurrency = toUpper(body?.currency);
    const rawTitle = (body?.title ?? '').toString().trim();

    const hasDynamic =
      Number.isFinite(rawAmount) && rawAmount > 0 && !!rawCurrency;

    const currency_id = hasDynamic ? rawCurrency : 'COP';
    let unit_price = hasDynamic ? rawAmount : 10000;

    if (currency_id === 'COP') {
      unit_price = Math.round(unit_price);
    } else {
      unit_price = Math.round(unit_price * 100) / 100;
    }

    const title =
      (hasDynamic && rawTitle) ? rawTitle.slice(0, 255)
      : (hasDynamic ? `Fee contratación` : 'Producto de prueba');

    const baseUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000').replace(/\/+$/, '');

    const buyerEmail = 'test_user_XXXXXXXX@testuser.com';

    const payload = {
      items: [
        {
          id: 'fee-001',
          title,
          quantity: 1,
          unit_price,
          currency_id,
        },
      ],
      payer: { email: buyerEmail },
      back_urls: {
        success: `${baseUrl}/?status=success`,
        failure: `${baseUrl}/?status=failure`,
        pending: `${baseUrl}/?status=pending`,
      },
    };

    console.log('[MP][create-preference] using payload:', {
      title,
      unit_price,
      currency_id,
      hasDynamic,
      sentByClient: {
        amount: body?.amount,
        currency: body?.currency,
        title: rawTitle,
      },
    });

    const client = new MercadoPagoConfig({ accessToken, options: { timeout: 10_000 } });
    const preference = new Preference(client);

    const r = await preference.create({
      body: payload,
      requestOptions: { idempotencyKey: randomUUID() },
    });

    const init_point = (r as any)?.init_point || (r as any)?.sandbox_init_point || null;
    const preference_id = (r as any)?.id;

    return NextResponse.json({ init_point, preference_id });
  } catch (err) {
    console.error('[MP create preference] ERROR:', err);
    return NextResponse.json({ error: 'Error al crear la preferencia' }, { status: 500 });
  }
}
