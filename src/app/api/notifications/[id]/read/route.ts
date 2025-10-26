import { NextRequest, NextResponse } from 'next/server';

async function gqlFetch<T>(req: NextRequest, query: string, variables?: any): Promise<T> {
    const res = await fetch(`${process.env.NEXT_PUBLIC_GQL_PATH ?? ''}/api/graphql` || '/api/graphql', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            cookie: req.headers.get('cookie') ?? '',
            authorization: req.headers.get('authorization') ?? '',
        },
        body: JSON.stringify({ query, variables }),
        cache: 'no-store',
    });

    const raw = await res.text();
    let data: any = null;
    try { data = raw ? JSON.parse(raw) : null; } catch {}
    if (!res.ok || data?.errors?.length) {
        const msg = data?.errors?.map((e: any) => e.message).join(' | ') || `HTTP ${res.status}`;
        throw new Error(msg);
    }
    return data.data as T;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const id = params?.id;
        if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

        const mutation = `
      mutation U($input: UpdateNotificationInput!) {
        updateNotification(input: $input) {
          id read_at
        }
      }
    `;

        const resp = await gqlFetch<{ updateNotification: { id: string; read_at: string } }>(
            req,
            mutation,
            { input: { id, readAt: new Date().toISOString() } }
        );

        return NextResponse.json({ notification: resp.updateNotification }, { status: 200 });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || 'Error marking as read' }, { status: 500 });
    }
}
