"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  apiFetch,
  type DosarPayload,
  type Lector,
} from "@/lib/api";

function EditForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cod = useMemo(
    () => (searchParams.get("cod") || "").trim(),
    [searchParams],
  );

  const [nume, setNume] = useState("");
  const [lector, setLector] = useState("");
  const [ritm, setRitm] = useState("");
  const [limba, setLimba] = useState("auto");
  const [usernameStudent, setUsernameStudent] = useState("");
  const [passwordStudent, setPasswordStudent] = useState("");
  const [lectori, setLectori] = useState<Lector[]>([]);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);

  const dosarHref = cod ? `/dosar/${encodeURIComponent(cod)}` : "/cursanti";

  useEffect(() => {
    if (!cod) {
      setLoadError("Missing COD.");
      setReady(true);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const [dosarRes, lectRes] = await Promise.all([
          apiFetch(`/dosar?cod=${encodeURIComponent(cod)}`),
          apiFetch("/lectori"),
        ]);
        if (cancelled) return;

        if (dosarRes.status === 401 || lectRes.status === 401) {
          router.replace("/login");
          return;
        }
        if (lectRes.status === 403) {
          setLoadError("Only admin can edit students.");
          setReady(true);
          return;
        }
        if (dosarRes.status === 404) {
          setLoadError("Student not found.");
          setReady(true);
          return;
        }
        if (dosarRes.status === 403) {
          setLoadError("You do not have access to this dossier.");
          setReady(true);
          return;
        }
        if (!dosarRes.ok) {
          setLoadError("Could not load student.");
          setReady(true);
          return;
        }

        const json = (await dosarRes.json()) as DosarPayload;
        const c = json.cursant;
        setNume(c.nume ?? "");
        setLector(c.lector ?? "");
        setRitm(
          c.ritm_zile === null || c.ritm_zile === undefined
            ? ""
            : String(c.ritm_zile),
        );
        const lim = (c.limba || "auto").trim().toLowerCase();
        setLimba(lim === "ro" || lim === "en" ? lim : "auto");
        setUsernameStudent(c.username_student ?? "");
        setPasswordStudent("");

        if (lectRes.ok) {
          const lectData = (await lectRes.json()) as Lector[];
          setLectori(lectData);
        }

        setLoadError("");
        setReady(true);
      } catch {
        if (!cancelled) {
          setLoadError("Could not load student.");
          setReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cod, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!cod) {
      setError("Missing COD.");
      return;
    }

    setPending(true);
    try {
      const body: {
        cod: string;
        nume: string;
        lector: string;
        limba: string;
        ritm_zile?: string;
        username_student?: string;
        password_student?: string;
      } = {
        cod,
        nume: nume.trim(),
        lector,
        limba,
      };
      const ritmTrim = ritm.trim();
      if (ritmTrim !== "") body.ritm_zile = ritmTrim;
      const userTrim = usernameStudent.trim();
      if (userTrim !== "") body.username_student = userTrim;
      const passTrim = passwordStudent.trim();
      if (passTrim !== "") body.password_student = passTrim;

      const res = await apiFetch("/cursant-edit", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (res.status === 403) {
        setError("Only admin can edit students.");
        return;
      }
      if (res.status === 404) {
        setError("Student does not exist.");
        return;
      }
      if (res.status === 409) {
        const json = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(json?.error || "Student username already in use.");
        return;
      }
      if (res.status === 400) {
        setError("Incomplete data.");
        return;
      }
      if (!res.ok) {
        setError("Could not save student.");
        return;
      }
      router.push(dosarHref);
    } catch {
      setError("Could not save student.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="mb-4 flex items-center gap-3 text-sm">
        <Link
          href={dosarHref}
          className="text-accent underline-offset-2 hover:underline"
        >
          ← Dossier
        </Link>
      </div>

      <header className="mb-6 border-b border-line pb-4">
        <h1
          className="text-2xl font-semibold text-accent"
          style={{ fontFamily: "var(--font-fraunces), serif" }}
        >
          Edit
        </h1>
        {cod ? (
          <p className="mt-1 text-sm text-foreground/60">
            Code: <span className="font-medium text-foreground">{cod}</span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-red-800" role="alert">
            Missing COD in URL (?cod=).
          </p>
        )}
      </header>

      {loadError ? (
        <p className="text-sm text-red-800" role="alert">
          {loadError}
        </p>
      ) : null}

      {!ready ? (
        <p className="text-sm text-foreground/60">Loading…</p>
      ) : null}

      {ready && !loadError && cod ? (
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-accent">Name</span>
            <input
              name="nume"
              value={nume}
              onChange={(e) => setNume(e.target.value)}
              required
              className="rounded-md border border-line bg-surface px-3 py-2.5 outline-none ring-honey/40 focus:ring-2"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-accent">Lecturer</span>
            <select
              name="lector"
              value={lector}
              onChange={(e) => setLector(e.target.value)}
              className="rounded-md border border-line bg-surface px-3 py-2.5 outline-none ring-honey/40 focus:ring-2"
            >
              <option value="">— no lecturer —</option>
              {lectori.map((L) => (
                <option key={L.id} value={L.username}>
                  {L.name || L.username} ({L.username})
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-accent">
              Rhythm (mission days, empty = null)
            </span>
            <input
              name="ritm_zile"
              type="number"
              min={1}
              value={ritm}
              onChange={(e) => setRitm(e.target.value)}
              className="w-full max-w-[12rem] rounded-md border border-line bg-surface px-3 py-2.5 outline-none ring-honey/40 focus:ring-2"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-accent">Language</span>
            <select
              name="limba"
              value={limba}
              onChange={(e) => setLimba(e.target.value)}
              className="rounded-md border border-line bg-surface px-3 py-2.5 outline-none ring-honey/40 focus:ring-2"
            >
              <option value="auto">Auto</option>
              <option value="ro">Romanian</option>
              <option value="en">English</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-accent">Student user</span>
            <input
              name="username_student"
              autoComplete="off"
              value={usernameStudent}
              onChange={(e) => setUsernameStudent(e.target.value)}
              placeholder="optional"
              className="rounded-md border border-line bg-surface px-3 py-2.5 outline-none ring-honey/40 focus:ring-2"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-accent">
              Student password (empty = unchanged)
            </span>
            <input
              name="password_student"
              type="password"
              autoComplete="new-password"
              value={passwordStudent}
              onChange={(e) => setPasswordStudent(e.target.value)}
              className="rounded-md border border-line bg-surface px-3 py-2.5 outline-none ring-honey/40 focus:ring-2"
            />
          </label>

          <p className="text-sm text-foreground/55">
            Edit the contract under{" "}
            <Link
              href="/inscrieri"
              className="font-medium text-accent underline-offset-2 hover:underline"
            >
              Enrollments
            </Link>
            .
          </p>

          {error ? (
            <p className="text-sm font-medium text-red-800" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-[#F4EFE6] transition hover:brightness-110 disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <Link
              href={dosarHref}
              className="text-sm text-foreground/65 underline-offset-2 hover:text-foreground hover:underline"
            >
              Cancel
            </Link>
          </div>
        </form>
      ) : null}
    </>
  );
}

export default function EditPage() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-6 sm:px-6">
      <Suspense fallback={<p className="text-sm text-foreground/60">Loading…</p>}>
        <EditForm />
      </Suspense>
    </main>
  );
}
