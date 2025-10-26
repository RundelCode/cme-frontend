import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
    const token = process.env.MP_ACCESS_TOKEN || '';
    const res = await fetch('https://api.mercadopago.com/users/me', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
    });
    let body: any = null;
    try { body = await res.json(); } catch { body = await res.text(); }
    return NextResponse.json({ status: res.status, body }, { status: res.status });
}
