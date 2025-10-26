import { NextRequest, NextResponse } from "next/server";

const SEARCH_COMPANIES = `
  query SearchCompanies($input: SearchCompaniesInput) {
    searchCompanies(input: $input) {
      id
      name
      email
      createdAt
      updatedAt
    }
  }
`;

const CREATE_COMPANY = `
  mutation CreateCompany($input: CreateCompanyInput!) {
    createCompany(input: $input) {
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

function isValidEmail(email: unknown): email is string {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function assertString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

async function gqlFetch<T = any>(
  endpoint: string,
  init: {
    query: string;
    variables?: Record<string, any>;
    headers?: Record<string, string>;
  }
): Promise<{ data?: T; errors?: Array<{ message: string }> }> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
    body: JSON.stringify({
      query: init.query,
      variables: init.variables ?? {},
    }),
  });

  const raw = await res.text();

  let json: any;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch (e) {
    throw new Error(
      `El gateway devolvió una respuesta no JSON. Status ${res.status}. Cuerpo: ${raw?.slice(
        0,
        300
      )}`
    );
  }

  if (!res.ok) {
    const msg =
      json?.errors?.map((e: any) => e.message).join(" | ") ||
      `Upstream ${res.status}`;
    throw new Error(msg);
  }

  return json;
}

export async function POST(req: NextRequest) {
  try {
    const endpoint = process.env.GRAPHQL_ENDPOINT;
    if (!endpoint) {
      console.error("GRAPHQL_ENDPOINT no definido");
      return NextResponse.json(
        { error: "Misconfig: GRAPHQL_ENDPOINT no definido" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const input = body?.input ?? {};

    if (!assertString(input?.name)) {
      return NextResponse.json(
        { error: "Campo 'name' es obligatorio" },
        { status: 400 }
      );
    }
    if (!isValidEmail(input?.email)) {
      return NextResponse.json(
        { error: "Campo 'email' es obligatorio y debe ser un email válido" },
        { status: 400 }
      );
    }

    const authorization = req.headers.get("authorization") ?? "";
    const cookie = req.headers.get("cookie") ?? "";

    const headers = { authorization, cookie };

    {
      const pre = await gqlFetch<{
        searchCompanies: Array<{ id: string; email: string }>;
      }>(endpoint, {
        query: SEARCH_COMPANIES,
        variables: { input: { q: input.email, limit: 10, offset: 0 } }, 
        headers,
      });

      const found =
        pre?.data?.searchCompanies?.find(
          (c) => (c?.email ?? "").toLowerCase() === input.email.toLowerCase()
        ) ?? null;

      if (found) {
        return NextResponse.json(
          {
            error:
              "Ya existe una empresa registrada con este email. Política: un usuario solo puede crear una empresa.",
            companyId: found.id,
          },
          { status: 409 }
        );
      }
    }

    const created = await gqlFetch<{
      createCompany: Record<string, any>;
    }>(endpoint, {
      query: CREATE_COMPANY,
      variables: { input },
      headers,
    });

    if (!created?.data?.createCompany?.id) {
      const msg =
        (created as any)?.errors?.map((e: any) => e.message).join(" | ") ||
        "No se recibió 'id' en la respuesta de createCompany";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    return NextResponse.json({ company: created.data.createCompany }, { status: 201 });
  } catch (err: any) {
    console.error("Error /api/company/create:", err);
    return NextResponse.json(
      { error: err?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
