"use client";

import { useEffect, useState } from "react";
import LabShell from "@/components/LabShell";
import { STUDENTS_ORIGIN } from "@/lib/student-paths";

export default function LabLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkMe() {
      try {
        const res = await fetch("/lab/api/me", {
          credentials: "include",
          cache: "no-store",
          headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
        });
        // Redirect to login ONLY on 401 — not 404 / HTML redirects / network noise.
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            role?: string;
          };
          // Cursant must never see Lab admin/lector shell.
          if ((data.role || "").trim() === "cursant") {
            window.location.replace(`${STUDENTS_ORIGIN}/`);
            return;
          }
        }
        if (!cancelled) setReady(true);
      } catch {
        // Network / parse errors are not logout.
        if (!cancelled) setReady(true);
      }
    }

    checkMe();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-foreground/60">
        Loading…
      </div>
    );
  }

  return <LabShell>{children}</LabShell>;
}
