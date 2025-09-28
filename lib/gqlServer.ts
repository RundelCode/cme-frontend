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

export async function gqlServer<T>(query: string, variables?: Record<string, unknown>) {
  const endpoint = process.env.GRAPHQL_ENDPOINT!;
  if (!endpoint) {
    throw new Error("GRAPHQL_ENDPOINT no está definido");
  }

  const cookieStore = await nextCookies();
  const cookieHeader = cookieStore.toString();
  const accessToken = cookieStore.get("access_token")?.value;

  const body = JSON.stringify({ query, variables });

  if (process.env.NEXT_DEBUG_GQL) {
    console.log("[gqlServer] endpoint:", endpoint);
    console.log("[gqlServer] variables:", variables);
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body,
    cache: "no-store",
  });

  const json = (await res.json()) as GraphQLResponse<T>;

  if (process.env.NEXT_DEBUG_GQL) {
    console.log("[gqlServer] status:", res.status);
    if (json.errors?.length) {
      console.error("[gqlServer] errors:", JSON.stringify(json.errors, null, 2));
    }
  }

  if (!res.ok) {
    const first = json?.errors?.[0]?.message ?? `HTTP ${res.status}`;
    throw new Error(first);
  }
  if (json?.errors?.length) {
    const first = json.errors[0];
    const msg =
      typeof first?.message === "string" && first.message.length
        ? first.message
        : "GraphQL Error";
    throw new Error(msg);
  }

  return json.data as T;
}