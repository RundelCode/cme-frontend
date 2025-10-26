"use client";

import React, { useEffect, useMemo, useState } from "react";
import styles from "./newOffer.module.css";
import { useRouter } from "next/navigation";
import Link from "next/link";

const GRAPHQL_ENDPOINT = process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT ?? "/api/graphql";

async function gql<T>(q: string, variables?: any) {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: q, variables })
  });

  const json = await res.json().catch(() => null);

  if (!res.ok || json?.errors?.length) {
    const err0 = json?.errors?.[0];
    const ext = err0?.extensions?.exception?.response;
    const message =
      (Array.isArray(ext?.message) && ext.message.join(" | ")) ||
      err0?.message ||
      `GraphQL failed (${res.status})`;
    throw new Error(message);
  }
  return json.data as T;
}

const AUTH_ME = `query { authMe { id email role } }`;

const COMPANY_BY_ADMIN = `query ($adminId: ID!) {
  companyByAdmin(adminId: $adminId) {
    id
    name
    profilePicture
    coverPhoto
    companyRating
  }
}`;

const CREATE_JOB = `
mutation CreateJob($input: CreateJobInput!) {
  createJob(input: $input) {
    id
    company_id
    title
    description
    employment_type
    location_type
    location
    salary
    currency
    status
    created_at
    updated_at
  }
}
`;

type FeeQuote = { bracket: string; feeLabel: string; feeValue: number; feePercent?: number };
function computeCmeFeeUSD(salaryUSD: number): FeeQuote {
  if (!salaryUSD || salaryUSD <= 0) return { bracket: "—", feeLabel: "—", feeValue: 0 };
  if (salaryUSD <= 1000) return { bracket: "≤ 1,000", feeLabel: "US$150", feeValue: 150 };
  if (salaryUSD <= 2500) return { bracket: "1,001–2,500", feeLabel: "US$250", feeValue: 250 };
  if (salaryUSD <= 3500) return { bracket: "2,501–3,500", feeLabel: "US$375", feeValue: 375 };
  if (salaryUSD <= 5000) return { bracket: "3,501–5,000", feeLabel: "US$500", feeValue: 500 };
  return { bracket: "≥ 5,001", feeLabel: "12% del monto", feeValue: Math.round(salaryUSD * 0.12), feePercent: 12 };
}

type EmploymentType = "full-time" | "part-time" | "services-agreement";
type LocationType = "remote" | "on_site" | "hybrid";

function normalizeEmploymentType(v: string | null | undefined): EmploymentType {
  const raw = (v ?? "").toLowerCase().trim();
  if (raw === "full-time" || raw === "full_time") return "full-time";
  if (raw === "part-time" || raw === "part_time") return "part-time";
  if (raw === "services-agreement" || raw === "service-agreement" || raw === "services" || raw === "contract")
    return "services-agreement";
  return "full-time";
}
function normalizeLocationType(v: string | null | undefined): LocationType {
  const raw = (v ?? "").toLowerCase().trim();
  if (raw === "remote") return "remote";
  if (raw === "on_site" || raw === "onsite" || raw === "on-site") return "on_site";
  if (raw === "hybrid") return "hybrid";
  return "remote";
}

type EmploymentTypeGQL = "FULL_TIME" | "PART_TIME" | "SERVICES_AGREEMENT";
type LocationTypeGQL = "REMOTE" | "ON_SITE" | "HYBRID";

function toGQLEnumEmployment(v: EmploymentType): EmploymentTypeGQL {
  switch (v) {
    case "full-time": return "FULL_TIME";
    case "part-time": return "PART_TIME";
    default: return "SERVICES_AGREEMENT";
  }
}
function toGQLEnumLocation(v: LocationType): LocationTypeGQL {
  switch (v) {
    case "remote": return "REMOTE";
    case "on_site": return "ON_SITE";
    default: return "HYBRID";
  }
}

type CreateJobInputPayload = {
  companyId: string;
  title: string;
  description: string;
  employmentType: EmploymentType;
  locationType: LocationType;
  location?: string;
  salary?: number;
  currency?: string;
  requirements?: string;
  skills?: string[];
};

type FormState = {
  companyId?: string;
  title: string;
  description: string;
  employmentType: string;
  locationType: string;
  location?: string | null;
  salary?: number | null;
  currency?: string | null;
};

type CompanyLite = {
  id: string;
  name: string;
  profilePicture?: string | null;
  coverPhoto?: string | null;
  companyRating?: number | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function buildCreateJobVariables(input: CreateJobInputPayload) {
  return {
    input: {
      company_id: input.companyId,
      title: input.title,
      description: input.description,
      employment_type: toGQLEnumEmployment(input.employmentType),
      location_type: toGQLEnumLocation(input.locationType),
      location: input.location ?? null,
      salary: input.salary ?? null,
      currency: input.currency ?? null,
      requirements: input.requirements ?? null,
      skills: input.skills ?? null,
    },
  };
}

export default function Client() {
  const router = useRouter();

  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [authErr, setAuthErr] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [adminCompany, setAdminCompany] = useState<CompanyLite | null>(null);
  const [companyLoading, setCompanyLoading] = useState(false);
  const isCompanyAdmin = (role ?? "").toLowerCase() === "company_admin";

  useEffect(() => {
    (async () => {
      try {
        setAuthLoading(true);
        const me = await gql<{ authMe: { id: string; role: string | null } }>(AUTH_ME);
        setRole(me?.authMe?.role ?? null);
        setUserId(me?.authMe?.id ?? null);
        if ((me?.authMe?.role ?? "").toLowerCase() !== "company_admin") {
          setAuthErr("Solo los usuarios con rol 'company_admin' pueden crear ofertas laborales.");
        }
      } catch (e: any) {
        setAuthErr(e?.message ?? "No autenticado");
      } finally {
        setAuthLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!isCompanyAdmin || !userId) return;
    (async () => {
      setCompanyLoading(true);
      try {
        const data = await gql<{ companyByAdmin: CompanyLite | null }>(COMPANY_BY_ADMIN, { adminId: userId });
        setAdminCompany(data?.companyByAdmin ?? null);
      } catch {
        setAdminCompany(null);
      } finally {
        setCompanyLoading(false);
      }
    })();
  }, [isCompanyAdmin, userId]);

  const [form, setForm] = useState<FormState>({
    companyId: "",
    title: "",
    description: "",
    employmentType: "full-time",
    locationType: "remote",
    location: "",
    salary: undefined,
    currency: "USD",
  });

  useEffect(() => {
    if (adminCompany?.id && UUID_RE.test(adminCompany.id)) {
      setForm((f) => ({ ...f, companyId: adminCompany.id }));
    }
  }, [adminCompany?.id]);

  const [skillsText, setSkillsText] = useState<string>("");
  const [requirementsText, setRequirementsText] = useState<string>("");

  const [salaryInput, setSalaryInput] = useState<string>("");
  const salaryNumber = useMemo(() => Number(salaryInput || 0), [salaryInput]);
  const fee = useMemo(() => computeCmeFeeUSD(salaryNumber), [salaryNumber]);

  const onChange =
    (key: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const value =
        e.currentTarget.type === "number"
          ? (e.currentTarget as HTMLInputElement).valueAsNumber
          : e.currentTarget.value;
      setForm((f) => ({ ...f, [key]: (key === "salary" ? Number(value) : value) as any }));
      if (key === "salary") setSalaryInput(String(value ?? ""));
    };

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<any | null>(null);
  const [showModal, setShowModal] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreated(null);

    if (!isCompanyAdmin) {
      setError("No tienes permisos para crear ofertas.");
      return;
    }
    if (companyLoading) {
      setError("Estamos validando tu empresa…");
      return;
    }
    if (!adminCompany?.id) {
      setError("Aún no tienes una empresa asociada. Crea tu empresa para poder publicar ofertas.");
      return;
    }

    const companyId = (adminCompany.id || "").trim();
    const titleTrim = (form.title || "").trim();
    const descTrim = (form.description || "").trim();

    if (!UUID_RE.test(companyId)) {
      setError("El ID de tu empresa no es un UUID válido.");
      return;
    }
    if (!titleTrim) {
      setError("El campo 'title' es obligatorio");
      return;
    }
    if (!descTrim) {
      setError("El campo 'description' es obligatorio");
      return;
    }

    const employmentType = normalizeEmploymentType(form.employmentType);
    const locationType = normalizeLocationType(form.locationType);

    const skills = (skillsText || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const requirements =
      (requirementsText || "")
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .join("\n") || undefined;

    const payload: CreateJobInputPayload = {
      companyId,
      title: titleTrim,
      description: descTrim,
      employmentType,
      locationType,
      location: (form.location || "").trim() || undefined,
      salary: isFinite(salaryNumber) && salaryNumber > 0 ? salaryNumber : undefined,
      currency: (form.currency || "USD").trim() || "USD",
      requirements,
      skills: skills.length ? skills : undefined,
    };

    const variables = buildCreateJobVariables(payload);

    setLoading(true);
    try {
      const data = await gql<{ createJob: any }>(CREATE_JOB, variables);
      if (!data?.createJob?.id) throw new Error("No se pudo crear la oferta");
      setCreated(data.createJob);
      setShowModal(true);
    } catch (err: any) {
      setError(err?.message || "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  function handleModalAccept() {
    setShowModal(false);
    if (created?.id) router.push(`/jobs/${created.id}`);
    else router.push("/");
  }

  return (
    <div className={styles.page}>
      <div className={styles.main}>
        <div className={styles.formCard}>
          <h2 className={styles.title}>Crear oferta laboral</h2>
          <p className={styles.subtitle}>Publica una vacante y visualiza la tarifa estimada según el salario.</p>

          {authLoading ? (
            <div className={styles.statusNote}>Cargando…</div>
          ) : authErr ? (
            <div className={styles.statusError}>{authErr}</div>
          ) : companyLoading ? (
            <div className={styles.statusNote}>Validando tu empresa…</div>
          ) : !adminCompany?.id ? (
            <div className={styles.statusError}>
              No tienes una empresa asociada todavía{" "}
              <Link className={styles.secundaryBtn} href="/createCompany">Crear empresa</Link>
            </div>
          ) : (
            <div className={styles.statusOk}>
              Publicarás como <b>{adminCompany.name}</b>{" "}
              <small style={{ opacity: .7 }}>({adminCompany.id})</small>.
            </div>
          )}

          <form onSubmit={handleSubmit} className={styles.formGrid} aria-disabled={!isCompanyAdmin}>
            <div className={styles.formField}>
              <label className={styles.label}>Cargo / Título *</label>
              <input
                className={styles.input}
                placeholder="Ej: Desarrollador Full Stack"
                value={form.title}
                onChange={onChange("title")}
                required
                disabled={!isCompanyAdmin || loading}
              />
            </div>

            <div className={styles.formFieldFull}>
              <label className={styles.label}>Descripción *</label>
              <textarea
                className={styles.textarea}
                placeholder="Describe las funciones, responsabilidades y el stack."
                rows={6}
                value={form.description}
                onChange={onChange("description")}
                required
                disabled={!isCompanyAdmin || loading}
              />
            </div>

            <div className={styles.twoCols}>
              <div className={styles.formField}>
                <label className={styles.label}>Tipo de contratación</label>
                <select
                  className={styles.input}
                  value={form.employmentType}
                  onChange={onChange("employmentType")}
                  disabled={!isCompanyAdmin || loading}
                >
                  <option value="full-time">Tiempo completo</option>
                  <option value="part-time">Medio tiempo</option>
                  <option value="services-agreement">Contrato de servicios</option>
                </select>
              </div>

              <div className={styles.formField}>
                <label className={styles.label}>Modalidad</label>
                <select
                  className={styles.input}
                  value={form.locationType}
                  onChange={onChange("locationType")}
                  disabled={!isCompanyAdmin || loading}
                >
                  <option value="remote">Remoto</option>
                  <option value="on_site">Presencial</option>
                  <option value="hybrid">Híbrido</option>
                </select>
              </div>
            </div>

            <div className={styles.formField}>
              <label className={styles.label}>Ubicación</label>
              <input
                className={styles.input}
                placeholder="Ciudad, País"
                value={form.location || ""}
                onChange={onChange("location")}
                disabled={!isCompanyAdmin || loading}
              />
            </div>

            <div className={styles.formField}>
              <label className={styles.label}>Salario (USD)</label>
              <input
                className={styles.input}
                inputMode="decimal"
                placeholder="Ej: 2500"
                value={salaryInput}
                onChange={(e) => {
                  const clean = e.target.value.replace(/[^\d.]/g, "");
                  setSalaryInput(clean);
                  setForm((f) => ({ ...f, salary: clean ? Number(clean) : undefined }));
                }}
                disabled={!isCompanyAdmin || loading}
              />
              <div className={styles.helperRow}>
                <span className={styles.helperText}>
                  <b>Tarifa CME:</b> {fee.feeLabel}{" "}
                  <span className={styles.dimmed}>
                    (rango: {fee.bracket}{fee.feePercent ? ` • ${fee.feePercent}%` : ""})
                  </span>
                </span>
              </div>
            </div>

            <div className={styles.formFieldFull}>
              <label className={styles.label}>Habilidades (separadas por coma)</label>
              <input
                className={styles.input}
                placeholder="React, Node, PostgreSQL"
                value={skillsText}
                onChange={(e) => setSkillsText(e.target.value)}
                disabled={!isCompanyAdmin || loading}
              />
            </div>

            <div className={styles.formFieldFull}>
              <label className={styles.label}>Requisitos (uno por línea)</label>
              <textarea
                className={styles.textarea}
                placeholder={`• 3+ años en React\n• Inglés intermedio`}
                rows={4}
                value={requirementsText}
                onChange={(e) => setRequirementsText(e.target.value)}
                disabled={!isCompanyAdmin || loading}
              />
            </div>

            {error && <div className={styles.statusError}>{error}</div>}
            {created && !showModal && (
              <div className={styles.statusOk}>
                <b>Oferta creada:</b> {created.title} (ID: {created.id})
              </div>
            )}

            <div className={styles.actions}>
              <button className={styles.primaryBtn} disabled={loading || !isCompanyAdmin} type="submit">
                {loading ? "Creando…" : "Crear oferta"}
              </button>
              <button
                className={styles.secundaryBtn}
                type="button"
                disabled={loading}
                onClick={() => {
                  setForm({
                    companyId: adminCompany?.id ?? "",
                    title: "",
                    description: "",
                    employmentType: "full-time",
                    locationType: "remote",
                    location: "",
                    salary: undefined,
                    currency: "USD",
                  });
                  setSkillsText("");
                  setRequirementsText("");
                  setError(null);
                  setCreated(null);
                  setSalaryInput("");
                }}
              >
                Limpiar
              </button>
            </div>
          </form>
        </div>
      </div>

      {showModal && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <h3 className={styles.modalTitle}>¡Oferta creada!</h3>
            <p className={styles.modalBody}>
              {created?.title ? (
                <>La oferta <b>{created.title}</b> se creó correctamente.</>
              ) : (
                "La oferta se creó correctamente."
              )}
            </p>
            <div className={styles.modalActions}>
              <button className={styles.primaryBtn} onClick={handleModalAccept}>
                Ver oferta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
