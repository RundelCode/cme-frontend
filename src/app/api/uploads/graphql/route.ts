import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
const UPSTREAM = process.env.NEXT_PUBLIC_UPLOADS_GRAPHQL_ENDPOINT || 'http://localhost:4000/graphql';

function pick(h: Headers, k: string) {
  return h.get(k) ?? h.get(k.toLowerCase());
}

export async function POST(req: NextRequest) {
  try {
    const inCT = pick(req.headers, 'content-type') || '';
    const inOpName = pick(req.headers, 'x-apollo-operation-name') || '';
    const inApolloPref = pick(req.headers, 'apollo-require-preflight') || '';
    const inAuth = pick(req.headers, 'authorization') || '';

    console.log('[proxy] incoming CT =', inCT);
    console.log('[proxy] incoming x-apollo-operation-name =', inOpName);
    console.log('[proxy] incoming apollo-require-preflight =', inApolloPref);
    console.log('[proxy] incoming authorization (present?) =', Boolean(inAuth));

    const headers: Record<string, string> = {};
    if (inCT) headers['content-type'] = inCT; // mantiene el boundary
    if (inOpName) headers['x-apollo-operation-name'] = inOpName;
    if (inApolloPref) headers['apollo-require-preflight'] = inApolloPref;
    if (inAuth) headers['authorization'] = inAuth;

    const upstreamRes = await fetch(UPSTREAM, {
      method: 'POST',
      // @ts-ignore
      duplex: 'half',
      headers,
      body: req.body as any,
    });

    console.log('[proxy] upstream status =', upstreamRes.status);
    console.log('[proxy] upstream CT =', upstreamRes.headers.get('content-type'));

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: {
        'content-type':
          upstreamRes.headers.get('content-type') || 'application/json',
      },
    });
  } catch (e: any) {
    console.error('[proxy] error =', e?.message, e);
    return new Response(
      JSON.stringify({ errors: [{ message: e?.message || 'proxy_failed' }] }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    );
  }
}
