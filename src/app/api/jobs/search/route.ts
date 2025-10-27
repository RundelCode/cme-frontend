// app/api/jobs/search/route.ts
import { NextRequest, NextResponse } from "next/server";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api").replace(/\/+$/, "");
const TARGET = `${API_URL}/jobs/search`;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const qs = url.searchParams.toString();
  const upstream = `${TARGET}${qs ? `?${qs}` : ""}`;

  const res = await fetch(upstream, {
    method: "GET",
    headers: { accept: "application/json" },
    credentials: "include",
  });

  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch {}

  if (!res.ok) {
    const msg = (json && (json.message || json.error)) || `HTTP ${res.status}`;
    return NextResponse.json({ error: msg }, { status: res.status });
  }

  return NextResponse.json(json ?? { items: [], total: 0 });
}
