import "server-only";
import { cookies as nextCookies } from "next/headers";

type GraphQLErrorItem = {
  message: string;
  path?: (string | number)[];
  extensions?: Record<string, unknown>;
};

type GraphQLResponse<T> = {
  data?: T;
  errors?: GraphQLErrorItem[];
};

type GqlServerOptions = {
  endpoint?: string;
  headers?: HeadersInit;
  operationName?: string;
  timeoutMs?: number;
};

export class GqlServerError extends Error {
  status: number;
  errors?: GraphQLErrorItem[];
  constructor(message: string, status: number, errors?: GraphQLErrorItem[]) {
    super(message);
    this.name = "GqlServerError";
    this.status = status;
    this.errors = errors;
  }
}

/**
 * Ejecuta una operación GraphQL desde el servidor (Route Handlers/Server Actions)
 * - Propaga cookies y Authorization del usuario actual.
 * - Lee el endpoint de:
 *   GRAPHQL_ENDPOINT || GRAPHQL_URL || NEXT_PUBLIC_GRAPHQL_URL
 */
export async function gqlServer<T>(
  query: string,
  variables?: Record<string, unknown>,
  opts: GqlServerOptions = {},
) {
  const endpoint =
    opts.endpoint ||
    process.env.GRAPHQL_ENDPOINT ||
    process.env.GRAPHQL_URL ||
    process.env.NEXT_PUBLIC_GRAPHQL_URL;

  if (!endpoint) {
    throw new Error("GRAPHQL_ENDPOINT/GRAPHQL_URL/NEXT_PUBLIC_GRAPHQL_URL no está definido");
  }

  const cookieStore = await nextCookies();
  const cookieHeader = cookieStore.toString();

  const accessToken =
    cookieStore.get("access_token")?.value ||
    cookieStore.get("sb-access-token")?.value ||
    cookieStore.get("sb-access-token-v2")?.value;

  const body = JSON.stringify({
    query,
    variables,
    ...(opts.operationName ? { operationName: opts.operationName } : {}),
  });

  if (process.env.NEXT_DEBUG_GQL) {
    console.log("[gqlServer] endpoint:", endpoint);
    console.log("[gqlServer] variables:", variables);
  }

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15000);

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...(opts.headers ?? {}),
      },
      body,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (e: any) {
    clearTimeout(id);
    throw new GqlServerError(e?.message || "fetch_failed", 0);
  }
  clearTimeout(id);

  let json: GraphQLResponse<T>;
  try {
    json = (await res.json()) as GraphQLResponse<T>;
  } catch {
    throw new GqlServerError(`Invalid GraphQL response (HTTP ${res.status})`, res.status);
  }

  if (process.env.NEXT_DEBUG_GQL) {
    console.log("[gqlServer] status:", res.status);
    if (json.errors?.length) {
      console.error("[gqlServer] errors:", JSON.stringify(json.errors, null, 2));
    }
  }

  if (!res.ok || json.errors?.length) {
    const msg =
      json.errors?.[0]?.message ??
      (res.status >= 400 ? `HTTP ${res.status}` : "GraphQL Error");
    throw new GqlServerError(msg, res.status, json.errors);
  }

  return json.data as T;
}
