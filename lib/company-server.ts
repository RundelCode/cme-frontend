import "server-only";
import { cookies as nextCookies, headers as nextHeaders } from "next/headers";

export type Company = {
  id: string;
  name: string;
  email?: string | null;
  website?: string | null;
  description?: string | null;
  industry?: string | null;
  location?: string | null;
  profilePicture?: string | null;
  coverPhoto?: string | null;
  companyRating?: number | null;
  boolVerified?: boolean | null;
  verifiedAt?: string | null;
  subscriptionPlan?: string | null;
  createdAt: string;
  updatedAt?: string | null;
};

function resolveBaseUrl() {
  const app = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (app) return app.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export async function getCompanyServer(id: string): Promise<Company> {
  const base = resolveBaseUrl();
  const cookieStore = await nextCookies();
  const cookieHeader = cookieStore.toString();
  const hdrs = await nextHeaders();
  const auth = hdrs.get("authorization") ?? undefined; 

  const res = await fetch(`${base}/api/company`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      ...(auth ? { authorization: auth } : {}),
    },
    body: JSON.stringify({ id }),
    cache: "no-store",
  });

  const json = await res.json().catch(() => ({}));
  if (process.env.NEXT_DEBUG_PAGES) {
    console.log("[getCompanyServer] status:", res.status, "body:", json);
  }

  if (!res.ok || !json?.company) {
    throw new Error(json?.error ?? `Company fetch failed for ${id} (HTTP ${res.status})`);
  }
  return json.company as Company;
}
