"use client";
import { useEffect } from "react";
import styles from "./page.module.css";
import { PropagateLoader } from "react-spinners";

export default function AuthCallback() {
  useEffect(() => {
    (async () => {
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const access_token = fragment.get("access_token");
      const refresh_token = fragment.get("refresh_token");

      console.log("[callback] access_token (client):", access_token);
      console.log("[callback] refresh_token (client):", refresh_token);

      if (!access_token) {
        console.error("[callback] no access_token in hash");
        return window.location.replace("/login");
      }

      const res = await fetch("/api/social-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ access_token, refresh_token }),
      });

      if (!res.ok) {
        console.error("social-login failed", await res.text());
        return window.location.replace("/login");
      }

      window.location.replace("/");
    })();
  }, []);

  return (
    <div className={styles.container}>
      <div>
        <PropagateLoader color="#152048" />
      </div>
    </div>
  );
}
