"use client";
import { useState, useMemo, useEffect } from "react";
import useSWR from "swr";
import Image from "next/image";
import { useRouter } from "next/navigation";
import styles from "./job.module.css";
import { PropagateLoader } from "react-spinners";

type Props = { jobId: string };

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error("Error en la solicitud");
    return r.json();
  });

function short(id: string) {
  if (!id) return "";
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

function Modal({
  open,
  title,
  message,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true">
      <div className={styles.modalCard}>
        <h3 className={styles.modalTitle}>{title}</h3>
        <p className={styles.modalBody}>{message}</p>
        <div className={styles.modalActions}>
          <button className={styles.primaryBtn} onClick={onClose} autoFocus>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function ReferModal({
  open,
  jobId,
  jobTitle,
  jobUrl,
  onClose,
}: {
  open: boolean;
  jobId: string;
  jobTitle: string;
  jobUrl: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"list" | "add">("list");

  // ⬇️ Paginación controlada
  const [page, setPage] = useState(0);     // 0-based
  const [limit, setLimit] = useState(10);  // 10 / 25 / 50

  const { data, error, isLoading, mutate } = useSWR(
    open && mode === "list"
      ? `/api/applications?jobOfferId=${jobId}&limit=${limit}&offset=${page * limit}`
      : null,
    fetcher
  );

  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const [referBusyId, setReferBusyId] = useState<string | null>(null);
  const [referMsg, setReferMsg] = useState<string | null>(null);
  const [referError, setReferError] = useState<string | null>(null);

  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  // reset general al cerrar
  useEffect(() => {
    if (!open) {
      setReferralCode(null);
      setGenError(null);
      setGenLoading(false);
      setMode("list");
      setContactName("");
      setContactPhone("");
      setReferBusyId(null);
      setReferMsg(null);
      setReferError(null);
      setPage(0); // reset de página
    }
  }, [open]);

  // si cambia la oferta, volvemos a la primera página
  useEffect(() => {
    setPage(0);
  }, [jobId]);

  // 1) People básicos desde /api/applications
  const peopleBasic: Array<{
    profileId: string;
    name: string | null;
    photo: string | null;
    occupation: string | null;
    reputation: number | null;
    appliedAt?: string;
  }> = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data.people)) return data.people; // por si ya viene expandido desde el backend
    if (Array.isArray(data.items)) {
      return data.items.map((a: any) => ({
        profileId: a.candidate_id,
        name: null,
        photo: null,
        occupation: null,
        reputation: null,
        appliedAt: a.created_at,
      }));
    }
    return [];
  }, [data]);

  // 2) IDs únicos a enriquecer
  const ids = useMemo(
    () => Array.from(new Set(peopleBasic.map((p) => p.profileId).filter(Boolean))),
    [peopleBasic]
  );

  // 3) Fetch de perfiles (intenta GET /api/profiles?ids=..., si falla prueba POST /api/profiles/batch, si no GraphQL)
  const idsKey = useMemo(() => (ids.length ? ids.join(",") : ""), [ids]);

  const { data: profilesData, isLoading: loadingProfiles } = useSWR(
    open && mode === "list" && idsKey ? ["profiles-merge", idsKey] : null,
    async (_key: string, idsJoined: string) => {
      const idsArg = idsJoined.split(",").filter(Boolean);

      const tryGet = async () => {
        const q = encodeURIComponent(idsJoined);
        const r = await fetch(`/api/profiles?ids=${q}`, { method: "GET" });
        if (!r.ok) throw new Error("GET /api/profiles not available");
        return r.json();
      };

      // try POST /api/profiles/batch { ids }
      const tryPostBatch = async () => {
        const r = await fetch(`/api/profiles/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: idsArg }),
        });
        if (!r.ok) throw new Error("POST /api/profiles/batch not available");
        return r.json();
      };

      // try GraphQL directo
      const tryGraphql = async () => {
        const query = `
        query ProfilesByIds($ids: [ID!]!) {
          profilesByIds(ids: $ids) {
            id
            full_name
            profile_picture
            occupation
            reputation_score
          }
        }
      `;
        const r = await fetch(`/api/graphql`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, variables: { ids: idsArg }, operationName: "ProfilesByIds" }),
        });
        const j = await r.json();
        if (j?.errors?.length) throw new Error("GraphQL profilesByIds failed");
        return { profiles: j?.data?.profilesByIds ?? [] };
      };

      try {
        const j = await tryGet();
        const profiles = j?.profiles ?? j ?? [];
        return { profiles };
      } catch {
        try {
          const j = await tryPostBatch();
          const profiles = j?.profiles ?? j ?? [];
          return { profiles };
        } catch {
          const j = await tryGraphql();
          const profiles = j?.profiles ?? j ?? [];
          return { profiles };
        }
      }
    },
    {
      // 👇 evita revalidaciones que te estaban disparando el loader
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60_000, // 1 minuto
      keepPreviousData: true,
    }
  );

  // 4) Fusionar perfiles en people
  const profileMap: Record<
    string,
    { name?: string | null; photo?: string | null; occupation?: string | null; reputation?: number | null }
  > = useMemo(() => {
    const map: Record<string, any> = {};
    const arr = profilesData?.profiles ?? [];
    for (const p of arr) {
      map[p.id] = {
        name: p.full_name ?? p.name ?? null,
        photo: p.profile_picture ?? p.photo ?? null,
        occupation: p.occupation ?? null,
        reputation: p.reputation_score ?? p.reputation ?? null,
      };
    }
    return map;
  }, [profilesData]);

  const people: typeof peopleBasic = useMemo(() => {
    if (!peopleBasic.length) return [];
    if (!ids.length) return peopleBasic;
    return peopleBasic.map((p) => {
      const ext = profileMap[p.profileId] || {};
      return {
        ...p,
        name: ext.name ?? p.name,
        photo: ext.photo ?? p.photo,
        occupation: ext.occupation ?? p.occupation,
        reputation: ext.reputation ?? p.reputation,
      };
    });
  }, [peopleBasic, profileMap, ids.length]);

  function renderStars(value: number | null | undefined, max = 5) {
    if (value == null) return null;
    const rating = Math.min(5, Math.max(0, value));
    const rounded = Math.round(rating);
    const stars = [];
    for (let i = 1; i <= max; i++) {
      stars.push(<span key={i}>{i <= rounded ? "★" : "☆"}</span>);
    }
    return (
      <span className={styles.stars}>
        {stars}
        <span className={styles.starsNumber}>({rating.toFixed(1)})</span>
      </span>
    );
  }

  async function handleGenerateCode() {
    setGenLoading(true);
    setGenError(null);
    try {
      const res = await fetch(`/api/referrals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobOfferId: jobId }),
      });

      let payload: any = null;
      try { payload = await res.json(); } catch { payload = null; }

      if (res.status === 401) {
        throw new Error("No autorizado. Inicia sesión para continuar.");
      }
      if (!res.ok || !payload?.code) {
        throw new Error(payload?.message || payload?.error || "No se pudo generar el código. Intenta nuevamente.");
      }

      const code = String(payload.code);
      setReferralCode(code);

      try { await navigator.clipboard.writeText(code); } catch { }
    } catch (e: any) {
      setGenError(e?.message || "Error generando el código.");
    } finally {
      setGenLoading(false);
    }
  }

  async function handleReferCandidate(candidateId: string) {
    setReferError(null);
    setReferMsg(null);
    setReferBusyId(candidateId);
    try {
      const res = await fetch(`/api/referrals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobOfferId: jobId, candidateId }),
      });

      let payload: any = null;
      try { payload = await res.json(); } catch { payload = null; }

      if (res.status === 401) {
        router.push(`/login?next=/jobs/${jobId}`);
        return;
      }

      if (!res.ok) {
        const msg = String(payload?.error || payload?.message || "");
        if (/already|exists|conflict|409|23505/i.test(msg)) {
          setReferError("Ya existe una referencia para este candidato en esta oferta.");
        } else {
          setReferError("No se pudo crear la referencia. Intenta nuevamente.");
        }
        return;
      }

      const code = payload?.code ? ` Código: ${payload.code}.` : "";
      setReferMsg(`Referencia creada correctamente.${code}`);
      mutate?.();
    } catch (e: any) {
      setReferError(e?.message || "Error creando la referencia.");
    } finally {
      setReferBusyId(null);
    }
  }

  function toWaNumber(input: string): string | null {
    const digits = (input || "").replace(/\D/g, "");
    if (digits.length < 8) return null;
    return digits;
  }

  function handleOpenWhatsApp() {
    if (!referralCode) {
      setGenError("Primero genera el código de referido.");
      return;
    }
    const waNumber = toWaNumber(contactPhone);
    if (!waNumber) {
      setGenError("Teléfono inválido. Incluye código de país (ej: 573001234567).");
      return;
    }
    const greeting = contactName?.trim() ? `Hola ${contactName.trim()}` : "Hola";
    const msg = `${greeting}
Vi una oferta que te puede interesar: ${jobTitle}
${jobUrl}

Este es tu codigo de referido: ${referralCode}
Úsalo al aplicar para que quede asociada la recomendación.`;
    const url = `https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  if (!open) return null;

  // Heurística sin "total": si recibes menos de limit, no hay siguiente página
  const canNext = (peopleBasic.length >= limit);

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true">
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Interesados</h3>
        </div>

        <div className={styles.modeSwitch}>
          <button
            className={styles.primaryBtn}
            onClick={() => setMode("list")}
            aria-pressed={mode === "list"}
          >
            Ver interesados
          </button>
          <button
            className={styles.secundaryBtn}
            onClick={() => setMode("add")}
            aria-pressed={mode === "add"}
          >
            Agregar referido
          </button>
        </div>

        {mode === "list" ? (
          <div>
            {(isLoading || loadingProfiles) && (
              <div className={styles.loading}>
                <PropagateLoader />
              </div>
            )}
            {error && (
              <div className={styles.error}>
                No se pudo cargar la lista de interesados.
              </div>
            )}

            {referMsg && (
              <div className={styles.text} style={{ color: "#065f46" }}>
                {referMsg}
              </div>
            )}
            {referError && <div className={styles.error}>{referError}</div>}

            {!isLoading && !error && people.length === 0 && (
              <p className={styles.text}>Aún no hay interesados para esta oferta.</p>
            )}

            {!isLoading && !error && people.length > 0 && (
              <>
                <ul className={styles.list}>
                  {people.map((p) => (
                    <div key={p.profileId} className={styles.personLink}>
                      <Image
                        src={p.photo || "/images/placeholders/company.png"}
                        alt={p.name ?? p.profileId}
                        width={48}
                        height={48}
                        className={styles.avatar}
                      />
                      <div className={styles.personInfo}>
                        <a
                          href={`/profiles/users?id=${p.profileId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.personName}
                        >
                          {p.name ?? `ID ${short(p.profileId)}`}
                        </a>
                        <div className={styles.personSub}>
                          {p.occupation ?? "—"}
                          {p.appliedAt ? (
                            <span className={styles.personAppliedAt}>
                              {" · "}Aplicó: {new Date(p.appliedAt).toLocaleString()}
                            </span>
                          ) : null}
                        </div>
                        <div className={styles.rating}>
                          {renderStars(p.reputation)}
                        </div>
                      </div>
                      <button
                        className={styles.modalReferButton}
                        onClick={() => handleReferCandidate(p.profileId)}
                        disabled={referBusyId === p.profileId}
                        aria-busy={referBusyId === p.profileId}
                        title="Crear referencia para este candidato"
                      >
                        {referBusyId === p.profileId ? "Creando..." : "Referir"}
                      </button>
                    </div>
                  ))}
                </ul>

                {/* Pager */}
                <div className={styles.pager}>
                  <div className={styles.pageSize}>
                    <label className={styles.small} htmlFor="psize">
                      Mostrar
                    </label>
                    <select
                      id="psize"
                      className={styles.select}
                      value={limit}
                      onChange={(e) => {
                        setPage(0);
                        setLimit(parseInt(e.target.value, 10) || 10);
                      }}
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                    </select>
                  </div>

                  <div className={styles.pageNav}>
                    <button
                      className={styles.secundaryBtn}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0 || isLoading}
                    >
                      Anterior
                    </button>

                    <span className={styles.pageLabel}>Página {page + 1}</span>

                    <button
                      className={styles.secundaryBtn}
                      onClick={() => setPage((p) => p + 1)}
                      disabled={isLoading || !canNext}
                      title={!canNext ? "No hay más resultados" : ""}
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className={styles.referSection}>
            <p className={styles.text}>
              Comparte esta oferta con tu contacto. Puedes generar un{" "}
              <b>código de referido</b> para asociar la postulación a tu
              recomendación, y enviar un mensaje de WhatsApp personalizado con
              los detalles.
            </p>

            {/* Inputs nombre y teléfono */}
            <div className={styles.formGrid} style={{ width: "100%" }}>
              <label className={styles.formField}>
                <span>Nombre del contacto</span>
                <input
                  type="text"
                  placeholder="Ej: Laura Pérez"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className={styles.input}
                />
              </label>

              <label className={styles.formField}>
                <span>Teléfono (incluye código de país)</span>
                <input
                  type="tel"
                  placeholder="Ej: 573001234567"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className={styles.input}
                  inputMode="tel"
                />
              </label>
            </div>

            <div className={styles.modalSubActions}>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={handleGenerateCode}
                disabled={genLoading}
                aria-busy={genLoading}
              >
                {genLoading ? "Generando..." : "Generar código de referido"}
              </button>
            </div>

            {referralCode && (
              <div className={styles.referCode} style={{ marginTop: 8 }}>
                <b>CÓDIGO GENERADO</b> <code>{referralCode}</code>
                <p>(copiado al portapapeles)</p>

                <button
                  type="button"
                  className={styles.secundaryBtnWPP}
                  onClick={handleOpenWhatsApp}
                  disabled={!contactPhone.trim()}
                >
                  Enviar mensaje de WhatsApp
                </button>
              </div>
            )}

            {genError && <div className={styles.error}>{genError}</div>}
          </div>
        )}

        <div className={styles.modalActions}>
          <button className={styles.secundaryBtn} onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}


export default function JobDetailClient({ jobId }: Props) {
  const router = useRouter();

  const { data, error, isLoading } = useSWR(
    jobId ? `/api/jobs/${jobId}` : null,
    fetcher
  );
  const { data: meData } = useSWR(`/api/me`, fetcher);
  const userId: string | null = meData?.user?.id ?? null;

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalMsg, setModalMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [referOpen, setReferOpen] = useState(false);

  const [absJobUrl, setAbsJobUrl] = useState<string>("");

  useEffect(() => {
    if (typeof window !== "undefined" && jobId) {
      setAbsJobUrl(`${window.location.origin}/jobs/${jobId}`);
    }
  }, [jobId]);

  function openModal(title: string, message: string) {
    setModalTitle(title);
    setModalMsg(message);
    setModalOpen(true);
  }

  if (!jobId) return null;
  if (isLoading)
    return (
      <div className={styles.loading}>
        <PropagateLoader />
      </div>
    );
  if (error || !data?.job)
    return <div className={styles.error}>No se pudo cargar la oferta.</div>;

  const { job, company } = data as {
    job: {
      id: string;
      company_id: string | null;
      title: string;
      description?: string | null;
      employment_type?: string | null;
      location_type?: string | null;
      skills?: string[] | null;
      requirements?: string | null;
      location?: string | null;
      salary?: number | null;
      currency?: string | null;
    };
    company: {
      name?: string | null;
      profilePicture?: string | null;
      coverPhoto?: string | null;
      location?: string | null;
    } | null;
  };

  const salary =
    job.salary == null
      ? "—"
      : new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: job.currency ?? "USD",
        maximumFractionDigits: 2,
      }).format(job.salary);

  const companyName =
    company?.name ?? (job.company_id ? `Company #${short(job.company_id)}` : "Company");
  const companyLogo = company?.profilePicture ?? null;
  const companyCover = company?.coverPhoto ?? null;
  const loc = job.location ?? company?.location ?? "—";

  async function showInterest() {
    if (!userId) {
      router.push(`/login?next=/jobs/${jobId}`);
      return;
    }

    const mapErrorToEs = (status: number, rawMsg: string | undefined) => {
      const msg = String(rawMsg || "").toLowerCase();
      if (status === 409 || /already_applied|application already exists|duplicate key|23505/.test(msg)) {
        return "Ya mostraste tu interes a esta oferta.";
      }
      if (status === 401 || /unauth|not\s*authenticated|forbidden|missing token/.test(msg)) {
        return "No autorizado. Inicia sesión para continuar.";
      }
      return "No se pudo mostrar interes. Intenta nuevamente.";
    };

    setSubmitting(true);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: jobId,
          notes: "",
        }),
      });

      let payload: any = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }

      if (res.status === 401) {
        router.push(`/login?next=/jobs/${jobId}`);
        return;
      }

      if (!res.ok) {
        const custom = mapErrorToEs(res.status, payload?.error || payload?.message);
        openModal(res.status === 409 ? "Ya aplicaste" : "Error", custom);
        return;
      }

      openModal("¡Listo!", "Mostraste tu interes exitosamente.");
    } catch (e: any) {
      openModal("Error", "No se pudo mostrar interes. Intenta nuevamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.main}>
      <Modal
        open={modalOpen}
        title={modalTitle}
        message={modalMsg}
        onClose={() => setModalOpen(false)}
      />

      <ReferModal
        open={referOpen}
        jobId={job.id}
        jobTitle={job.title}
        jobUrl={absJobUrl || `/jobs/${job.id}`}
        onClose={() => setReferOpen(false)}
      />

      <div className={styles.modal}>
        <div className={styles.cover}>
          {companyCover ? (
            <Image src={companyCover} alt="" fill className={styles.coverImg} priority />
          ) : null}
        </div>

        <div className={styles.infoSection}>
          <div className={styles.logoWrapper}>
            {companyLogo ? (
              <Image
                src={companyLogo}
                alt={companyName}
                width={72}
                height={72}
                className={styles.logoImg}
              />
            ) : (
              <div className={styles.logoPlaceholder} />
            )}
          </div>

          <div className={styles.header}>
            <div className={styles.meta}>
              {companyName} · {loc}
            </div>
            <div className={styles.title}>{job.title}</div>

            <div className={styles.textSection}>
              <p>
                <b>Tipo:</b> {job.employment_type ?? "—"}
              </p>
              {" · "}
              <p>
                <b>Modalidad:</b> {job.location_type ?? "—"}
              </p>
            </div>

            <div>
              <b>Salario:</b> {salary}
            </div>
          </div>

          {Array.isArray(job.skills) && job.skills.length > 0 && (
            <div className={styles.skills}>
              {job.skills.map((s) => (
                <span key={s} className={styles.skill}>
                  {s}
                </span>
              ))}
            </div>
          )}

          {job.description && (
            <div>
              <h3>Descripción</h3>
              <p className={styles.text}>{job.description}</p>
            </div>
          )}

          {job.requirements && (
            <div>
              <h3>Requisitos</h3>
              <p className={styles.text}>{job.requirements}</p>
            </div>
          )}

          <div className={styles.actions}>
            <button
              className={styles.primaryBtn}
              onClick={showInterest}
              disabled={submitting}
              aria-busy={submitting}
            >
              {submitting ? "Enviando..." : "Mostrar Interes"}
            </button>

            <button
              type="button"
              className={styles.secundaryBtn}
              onClick={() => setReferOpen(true)}
            >
              Referir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
