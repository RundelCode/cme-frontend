import { NextRequest } from 'next/server';

export const runtime = 'nodejs'; // IMPORTANTE: no edge

const UPSTREAM = process.env.NEXT_PUBLIC_UPLOADS_GRAPHQL_ENDPOINT || 'http://localhost:4000/graphql';

function pick(h: Headers, k: string) {
  return h.get(k) ?? h.get(k.toLowerCase());
}

export async function POST(req: NextRequest) {
  try {
    // Reusar todos los headers críticos del multipart
    const headers: Record<string, string> = {};
    const pass = [
      'content-type', // incluye el boundary!
      'content-length',
      'transfer-encoding',
      'authorization',
      'cookie',
      'x-apollo-operation-name',
      'apollo-require-preflight',
    ];

    for (const k of pass) {
      const v = pick(req.headers, k);
      if (v) headers[k] = v;
    }

    // OJO: duplex:'half' para streaming en Node
    const upstreamRes = await fetch(UPSTREAM, {
      method: 'POST',
      headers,
      body: req.body as any,
      // @ts-expect-error: duplex es necesario en Node >=18
      duplex: 'half',
      redirect: 'manual',
    });

    const outHeaders = new Headers();
    const ct = upstreamRes.headers.get('content-type') || 'application/json';
    outHeaders.set('content-type', ct);

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: outHeaders,
    });
  } catch (e: any) {
    console.error('[proxy] error =', e?.message, e);
    return new Response(
      JSON.stringify({ errors: [{ message: e?.message || 'proxy_failed' }] }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    );
  }
}
