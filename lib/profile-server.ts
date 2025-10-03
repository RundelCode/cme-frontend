import "server-only";
import { cookies as nextCookies, headers as nextHeaders } from "next/headers";
import { SearchProfilesInput, UserProfile } from "./profile-types";

function resolveBaseUrl() {
  const app = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (app) return app.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export async function searchProfilesServer(input: SearchProfilesInput = {}): Promise<UserProfile[]> {
  const base = resolveBaseUrl();
  const cookieStore = await nextCookies();
  const cookieHeader = cookieStore.toString();
  const hdrs = await nextHeaders();
  const auth = hdrs.get("authorization") ?? undefined;

  const res = await fetch(`${base}/api/profiles/search`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      ...(auth ? { authorization: auth } : {}),
    },
    body: JSON.stringify({ input }),
    cache: "no-store",
  });

  const text = await res.text();
  let json: any = {};
  try { json = JSON.parse(text); } catch {}
  if (!res.ok || !Array.isArray(json.items)) {
    throw new Error(json?.error ?? `Profile search failed (HTTP ${res.status})`);
  }
  return json.items as UserProfile[];
}
