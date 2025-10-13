"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = fragment.get("access_token");
    const refreshToken = fragment.get("refresh_token");

    if (!accessToken) {
      console.error("No se encontró access_token en el fragmento");
      return;
    }

    fetch("/api/social-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
      }),
      credentials: "include",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        // Espera medio segundo a que la cookie se guarde
        setTimeout(() => {
          window.location.replace("/"); // fuerza reload completo con cookies
        }, 500);
      })
      .catch((err) => {
        console.error("Error en social-login:", err);
      });
  }, [router]);

  return <p>Procesando autenticación...</p>;
}
