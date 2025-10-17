"use client";

import React, { useMemo, useState } from "react";

const GRAPHQL_ENDPOINT = process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT ?? "/api/graphql";

async function gql<T>(query: string, variables?: any) {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.errors?.length) {
    throw new Error(json?.errors?.[0]?.message ?? `GraphQL failed (${res.status})`);
  }
  return json.data as T;
}

const RATE_COMPANY = `
  mutation RateCompany($companyId: ID!, $rating: Float!) {
    rateCompany(companyId: $companyId, rating: $rating) {
      id
      companyRating
    }
  }
`;

const UPDATE_COMPANY = `
  mutation UpdateCompany($input: UpdateCompanyInput!) {
    updateCompany(input: $input) {
      id
      companyRating
    }
  }
`;

function Star({
  filled,
  onClick,
  onMouseEnter,
  onMouseLeave,
  size = 22,
}: {
  filled: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ cursor: "pointer", transition: "transform .08s", verticalAlign: "middle" }}
    >
      <path
        d="M12 .587l3.668 7.431 8.2 1.192-5.934 5.786 1.402 8.168L12 18.897l-7.336 3.867 1.402-8.168L.132 9.21l8.2-1.192z"
        fill={filled ? "#f59e0b" : "none"}
        stroke="#f59e0b"
        strokeWidth="1.2"
      />
    </svg>
  );
}

export default function CompanyRatingClient({
  companyId,
  initialRating = 0,
  className,
  valueClassName,
}: {
  companyId: string;
  initialRating?: number;
  className?: string;
  valueClassName?: string;
}) {
  const [value, setValue] = useState(Math.max(0, Math.min(5, initialRating)));
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const stars = useMemo(() => [0, 1, 2, 3, 4], []);

  async function submit(rating: number) {
    setSaving(true);
    const optimistic = rating;
    const prev = value;
    setValue(optimistic);

    try {
      try {
        const data = await gql<{ rateCompany: { id: string; companyRating: number } }>(
          RATE_COMPANY,
          { companyId, rating }
        );
        setValue(data.rateCompany.companyRating ?? optimistic);
        return;
      } catch {
        const data = await gql<{ updateCompany: { id: string; companyRating: number } }>(
          UPDATE_COMPANY,
          { input: { id: companyId, companyRating: rating } }
        );
        setValue(data.updateCompany.companyRating ?? optimistic);
      }
    } catch (e) {
      setValue(prev);
      console.error("rating error:", e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={className} aria-live="polite">
      {stars.map((i) => {
        const filled = hoverIdx != null ? i <= hoverIdx : i < Math.round(value);
        return (
          <Star
            key={i}
            filled={filled}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
            onClick={() => !saving && submit(i + 1)}
          />
        );
      })}
      <span className={valueClassName} style={{ marginLeft: 8 }}>
        {value.toFixed(1)}
      </span>
    </div>
  );
}
