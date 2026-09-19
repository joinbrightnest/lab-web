"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, type DosarPayload } from "@/lib/api";

function ProfilForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cod = useMemo(
    () => (searchParams.get("cod") || "").trim(),
    [searchParams],
  );

  const [dataStart, setDataStart] = useState("");
  const [context, setContext] = useState("");
  const [obiectiv, setObiectiv] = useState("");
  const [puncteTari, setPuncteTari] = useState("");
  const [focusStart, setFocusStart] = useState("");
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
        const res = await apiFetch(`/dosar?cod=${encodeURIComponent(cod)}`);
        if (cancelled) return;

        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (res.status === 404) {
          setLoadError("Student not found.");
          setReady(true);
          return;
        }
        if (res.status === 403) {
          setLoadError("Nu ai acces la acest dosar.");
          setReady(true);
          return;
        }
        if (!res.ok) {
          setLoadError("Could not load profile.");
          setReady(true);
          return;
        }

        const json = (await res.json()) as DosarPayload;
        const c = json.cursant;
        setDataStart((c.data_start ?? "").toString().slice(0, 10));
        setContext(c.context ?? "");
        setObiectiv(c.obiectiv ?? "");
        setPuncteTari(c.puncte_tari ?? "");
        setFocusStart(c.focus_start ?? "");
        setLoadError("");
        setReady(true);
      } catch {
        if (!cancelled) {
          setLoadError("Could not load profile.");
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
      // Câmp gol → backend păstrează valoarea din DB
      const res = await apiFetch("/profil-initial", {
        method: "POST",
        body: JSON.stringify({
          cod,
          data_start: dataStart.trim(),
          context: context.trim(),
          obiectiv: obiectiv.trim(),
          puncte_tari: puncteTari.trim(),
          focus_start: focusStart.trim(),
        }),
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (res.status === 403) {
        setError("You cannot edit this profile.");
        return;
      }
      if (res.status === 404) {
        setError("Student does not exist.");
        return;
      }
      if (res.status === 400) {
        setError("Date incomplete.");
        return;
      }
      if (!res.ok) {
        setError("Could not save profile.");
        return;
      }
      router.push(dosarHref);
    } catch {
      setError("Could not save profile.");
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
          ← Dosar
        </Link>
      </div>

      <header className="mb-6 border-b border-line pb-4">
        <h1
          className="text-2xl font-semibold text-accent"
          style={{ fontFamily: "var(--font-fraunces), serif" }}
        >
          Edit profile
        </h1>
        {cod ? (
          <p className="mt-1 text-sm text-foreground/60">
            Cod: <span className="font-medium text-foreground">{cod}</span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-red-800" role="alert">
            Missing COD in URL (?cod=).
          </p>
        )}
        <p className="mt-2 text-xs text-foreground/55">
          Empty fields do not clear saved values.
        </p>
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
            <span className="font-medium text-accent">Data start</span>
            <input
              name="data_start"
              type="date"
              value={dataStart}
              onChange={(e) => setDataStart(e.target.value)}
              className="w-full max-w-[16rem] rounded-md border border-line bg-surface px-3 py-2.5 outline-none ring-honey/40 focus:ring-2"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-accent">Cum a venit / context</span>
            <textarea
              name="context"
              rows={3}
              value={context}
              onChange={(e) => setContext(e.target.value)}
              className="rounded-md border border-line bg-surface px-3 py-2.5 outline-none ring-honey/40 focus:ring-2"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-accent">
              Obiectiv (cu vorbele lui)
            </span>
            <textarea
              name="obiectiv"
              rows={3}
              value={obiectiv}
              onChange={(e) => setObiectiv(e.target.value)}
              className="rounded-md border border-line bg-surface px-3 py-2.5 outline-none ring-honey/40 focus:ring-2"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-accent">Puncte tari observate</span>
            <textarea
              name="puncte_tari"
              rows={2}
              value={puncteTari}
              onChange={(e) => setPuncteTari(e.target.value)}
              className="rounded-md border border-line bg-surface px-3 py-2.5 outline-none ring-honey/40 focus:ring-2"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-accent">
              Focus first 2 weeks
            </span>
            <textarea
              name="focus_start"
              rows={2}
              value={focusStart}
              onChange={(e) => setFocusStart(e.target.value)}
              className="rounded-md border border-line bg-surface px-3 py-2.5 outline-none ring-honey/40 focus:ring-2"
            />
          </label>

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

export default function ProfilPage() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-6 sm:px-6">
      <Suspense fallback={<p className="text-sm text-foreground/60">Loading…</p>}>
        <ProfilForm />
      </Suspense>
    </main>
  );
}
