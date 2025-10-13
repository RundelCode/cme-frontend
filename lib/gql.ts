type GqlPayload<T> = { data?: T; errors?: { message: string }[] };

const TOKEN_COOKIE_NAMES = ['access_token', 'token', 'id_token', 'jwt', 'session'];

function parseCookieString(cookieHeader: string): Record<string, string> {
  return cookieHeader
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .reduce((acc, pair) => {
      const idx = pair.indexOf('=');
      if (idx > 0) {
        const k = decodeURIComponent(pair.slice(0, idx).trim());
        const v = decodeURIComponent(pair.slice(idx + 1).trim());
        acc[k] = v;
      }
      return acc;
    }, {} as Record<string, string>);
}

export async function gqlRequest<T>(
  endpoint: string,
  query: string,
  variables: Record<string, any> = {},
  forwardHeaders?: Headers,
  cookieHeader = ''
): Promise<T> {
  const baseHeaders: Record<string, string> = {
    'content-type': 'application/json',
    'accept': 'application/json',
  };

  if (forwardHeaders) {
    const pick = (name: string) =>
      forwardHeaders.get(name) ? { [name]: forwardHeaders.get(name)! } : {};
    Object.assign(
      baseHeaders,
      pick('authorization'),
      pick('accept-language'),
      pick('user-agent'),
      pick('x-forwarded-host'),
      pick('x-forwarded-proto'),
      pick('x-forwarded-for'),
      pick('x-correlation-id'),
    );
  }

  if (cookieHeader) baseHeaders['cookie'] = cookieHeader;

  if (!baseHeaders['authorization'] && cookieHeader) {
    const jar = parseCookieString(cookieHeader);
    const tokenName = TOKEN_COOKIE_NAMES.find(n => !!jar[n]);
    const rawToken = tokenName ? jar[tokenName] : undefined;
    if (rawToken) {
      const bearer = /^Bearer\s+/i.test(rawToken) ? rawToken : `Bearer ${rawToken}`;
      baseHeaders['authorization'] = bearer;
    } else {
      console.warn('[gqlRequest] No Authorization and no token cookie found.');
    }
  } else if (baseHeaders['authorization']) {
  }

  const timeoutMs = Number(process.env.GQL_REQUEST_TIMEOUT_MS ?? '15000');
  const controller = new AbortController();
  let timeoutHandle: any = null;
  if (timeoutMs > 0) {
    timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  }

  let res: Response | null = null;
  let responseText = '';
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'include',
      headers: baseHeaders,
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });

    responseText = await res.text();
  } catch (e: any) {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    throw e;
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }

  let json: GqlPayload<T> | null = null;
  try {
    json = responseText ? (JSON.parse(responseText) as GqlPayload<T>) : null;
  } catch {
  }

  if (!res!.ok || json?.errors?.length) {
    const msg =
      json?.errors?.map((e) => e.message).join(' | ') ||
      `HTTP ${res!.status}`;
    const err: any = new Error(msg);
    err.status = res!.status;
    err.raw = json;
    err.responseText = responseText;
    if (res!.status === 401 || /unauth|not\s*authenticated|forbidden|missing token/i.test(msg)) {
      err.code = 401;
    }
    throw err;
  }

  if (!json || typeof json.data === 'undefined') {
    const err: any = new Error('GraphQL response had no data');
    err.status = res!.status;
    err.responseText = responseText;
    throw err;
  }

  return json.data as T;
}
