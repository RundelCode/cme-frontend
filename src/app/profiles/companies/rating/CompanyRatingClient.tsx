"use client";

import React, { useMemo, useState } from "react";

const PATCH_API = (id: string) => `/api/company/${encodeURIComponent(id)}`;

async function patchCompanyRating(companyId: string, rating: number) {
  const res = await fetch(PATCH_API(companyId), {
    method: "PATCH",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ companyRating: rating, company_rating: rating }),
  });

  const txt = await res.text();
  let json: any = null;
  try { json = txt ? JSON.parse(txt) : null; } catch { }

  if (!res.ok) {
    const msg = json?.error || json?.message || `company PATCH failed (${res.status})`;
    throw new Error(msg);
  }

  const val =
    json?.companyRating ??
    json?.company?.companyRating ??
    json?.data?.companyRating ??
    json?.data?.company?.companyRating ??
    json?.company_rating ??
    json?.company?.company_rating ??
    json?.data?.company_rating ??
    json?.data?.company?.company_rating ??
    null;

  return typeof val === "number" ? val : Number(val);
}

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
      aria-hidden="true"
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
  const clamp = (n: number) => Math.max(0, Math.min(5, n));
  const [value, setValue] = useState(clamp(Number(initialRating) || 0));
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const stars = useMemo(() => [0, 1, 2, 3, 4], []);

  async function submit(rating: number) {
    setSaving(true);
    const optimistic = rating;
    const prev = value;
    setValue(optimistic);

    try {
      const res = await fetch(`/api/company/${companyId}/rating`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ rating }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || payload?.message || "rating_failed");
      const serverVal = Number(payload?.company?.companyRating);
      setValue(Number.isFinite(serverVal) ? serverVal : optimistic);
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
            onClick={() => submit(i + 1)}
          />
        );
      })}
      <span className={valueClassName} style={{ marginLeft: 8 }}>
        {value.toFixed(1)}
      </span>
    </div>
  );
}
