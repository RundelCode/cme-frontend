import { NextRequest, NextResponse } from "next/server";

const COMPANY_BY_ID = `
  query CompanyById($id: ID!) {
    company(id: $id) {
      id
      name
      email
      website
      description
      industry
      location
      profilePicture
      coverPhoto
      companyRating
      boolVerified
      verifiedAt
      subscriptionPlan
      createdAt
      updatedAt
    }
  }
`;

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "Missing 'id' in body" }, { status: 400 });
    }

    const endpoint = process.env.GRAPHQL_ENDPOINT;
    if (!endpoint) {
      console.error("GRAPHQL_ENDPOINT no definido");
      return NextResponse.json(
        { error: "Misconfig: GRAPHQL_ENDPOINT no definido" },
        { status: 500 }
      );
    }

    const authorization = req.headers.get("authorization") ?? "";
    const cookie = req.headers.get("cookie") ?? "";

    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization,
        cookie,
      },
      body: JSON.stringify({ query: COMPANY_BY_ID, variables: { id } }),
    });

    const raw = await upstream.text();

    let json: any;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error("Upstream devolvió no-JSON:\n", raw);
      return NextResponse.json(
        { error: "El gateway devolvió una respuesta no JSON.", details: raw?.slice(0, 300) },
        { status: 502 }
      );
    }

    if (!upstream.ok || json?.errors?.length || !json?.data?.company) {
      const message =
        json?.errors?.map((e: any) => e.message).join(" | ") ||
        `Upstream ${upstream.status}`;
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ company: json.data.company });
  } catch (err: any) {
    console.error("Error /api/company:", err);
    return NextResponse.json(
      { error: err?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
