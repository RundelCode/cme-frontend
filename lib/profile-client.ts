import { SearchProfilesInput, UserProfile } from "./profile-types";

export async function searchProfiles(input: SearchProfilesInput = {}): Promise<UserProfile[]> {
  const res = await fetch("/api/profiles", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ input }),
  });
  const text = await res.text();
  let json: any = {};
  try { json = JSON.parse(text); } catch {}
  if (!res.ok || !Array.isArray(json.items)) {
    throw new Error(json?.error ?? `Profile search failed (HTTP ${res.status})`);
  }
  return json.items as UserProfile[];
}
