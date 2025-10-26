// src/app/api/notifications/[id]/route.ts
import { NextResponse } from 'next/server';

const NOTIFICATION_Q = `
  query Notification($id: ID!) {
    notification(id: $id) {
      id
      user_id
      title
      message
      notification_type
      channel
      status
      related_id
      read_at
      created_at
      updated_at
    }
  }
`;

const UPDATE_NOTIF_M = `
  mutation UpdateNotification($input: UpdateNotificationInput!) {
    updateNotification(input: $input) {
      id
      status
      read_at
      updated_at
    }
  }
`;

function resolveGqlURL(origin: string) {
    return (
        process.env.NEXT_PUBLIC_GRAPHQL_URL?.trim() ||
        process.env.GRAPHQL_URL?.trim() ||
        `${origin}/api/graphql`
    );
}

async function gql<T = any>(req: Request, query: string, variables?: any, debug = false) {
    const { origin } = new URL(req.url);
    const url = resolveGqlURL(origin);

    const res = await fetch(url, {
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
    let data: any;
    try {
        data = raw ? JSON.parse(raw) : null;
    } catch {
        const e = new Error('json_parse_error');
        (e as any).__debug = { stage: 'parse', url, status: res.status, raw };
        throw e;
    }

    if (!res.ok || data?.errors?.length) {
        const message = data?.errors?.map((e: any) => e.message).join(' | ') || `HTTP ${res.status}`;
        const e = new Error(message);
        (e as any).__debug = { stage: 'gql', url, status: res.status, request: { variables }, responseRaw: raw, response: data };
        throw e;
    }

    const payload: any = { data: data?.data };
    if (debug) payload.__debug = { url, variables, responseRaw: raw, response: data };
    return payload as T;
}

export async function GET(req: Request, ctx: any) {
    const url = new URL(req.url);
    const debug = url.searchParams.get('__debug') === '1' || req.headers.get('x-debug') === '1';

    try {
        const id: string | undefined = ctx?.params?.id;
        if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

        const resp: any = await gql(req, NOTIFICATION_Q, { id }, debug);
        const notification = resp.data?.notification ?? null;

        return NextResponse.json(
            debug ? { notification, __debug: resp.__debug } : { notification },
            { status: 200 }
        );
    } catch (e: any) {
        const payload = { error: e?.message || 'notification_get_failed', __debug: e?.__debug || null };
        return NextResponse.json(payload, { status: 500 });
    }
}

export async function PATCH(req: Request, ctx: any) {
    const url = new URL(req.url);
    const debug = url.searchParams.get('__debug') === '1' || req.headers.get('x-debug') === '1';

    try {
        const id: string | undefined = ctx?.params?.id;
        if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

        const body = await req.json().catch(() => ({} as any));

        const status: string | undefined =
            typeof body?.status === 'string' && body.status.trim() ? body.status : undefined;

        const rawReadAt = body?.readAt as unknown;
        let readAt: string | undefined;
        if (rawReadAt === true || rawReadAt === 'now') readAt = new Date().toISOString();
        else if (typeof rawReadAt === 'string' && rawReadAt.trim()) readAt = rawReadAt;

        if (!status && !readAt) {
            return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
        }

        const input: any = { id };
        if (status) input.status = status;
        if (readAt) input.readAt = readAt;

        const resp: any = await gql(req, UPDATE_NOTIF_M, { input }, debug);
        const notification = resp.data?.updateNotification ?? null;

        return NextResponse.json(
            debug ? { notification, __debug: resp.__debug } : { notification },
            { status: 200 }
        );
    } catch (e: any) {
        const payload = { error: e?.message || 'notification_update_failed', __debug: e?.__debug || null };
        return NextResponse.json(payload, { status: 500 });
    }
}

export async function OPTIONS(_req: Request) {
    return NextResponse.json({}, { status: 200 });
}
