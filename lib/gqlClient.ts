export async function gql<T>(query: string, variables?: Record<string, unknown>) {
  const body = JSON.stringify({ query, variables });


  const res = await fetch("/api/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body,
  });

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    const text = await res.text();
    throw new Error(`GraphQL: respuesta no JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    const msg = json?.errors?.[0]?.message ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  if (json?.errors?.length) {
    throw new Error(json.errors[0]?.message ?? "GraphQL error");
  }
  if (!json?.data) {
    throw new Error("GraphQL: respuesta sin 'data'");
  }

  return json.data as T;
}
