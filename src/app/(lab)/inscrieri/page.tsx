"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  apiFetch,
  type Cursant,
  type Inscriere,
  type Lector,
} from "@/lib/api";

function fmtMoney(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return `${Number(n).toLocaleString("ro-RO")} lei`;
}

function modPlataLabel(m?: string | null) {
  const v = (m || "transfer").trim().toLowerCase();
  if (v === "stripe") return "Stripe";
  if (v === "altul") return "Altul";
  return "Transfer";
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

export default function InscrieriPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Inscriere[] | null>(null);
  const [cursanti, setCursanti] = useState<Cursant[]>([]);
  const [lectori, setLectori] = useState<Lector[]>([]);
  const [error, setError] = useState("");
  const [actionId, setActionId] = useState<number | null>(null);

  const [cursantCod, setCursantCod] = useState("");
  const [lectorUsername, setLectorUsername] = useState("");
  const [pret, setPret] = useState("1500");
  const [startLa, setStartLa] = useState(todayYmd);
  const [formError, setFormError] = useState("");
  const [formPending, setFormPending] = useState(false);
  const [backfillPending, setBackfillPending] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState("");
  const [newOpen, setNewOpen] = useState(true);

  async function loadList() {
    const res = await apiFetch("/inscrieri");
    if (res.status === 401) {
      router.replace("/login");
      return false;
    }
    if (res.status === 403) {
      router.replace("/cursanti");
      return false;
    }
    if (!res.ok) {
      setError("Could not load enrollments.");
      return false;
    }
    const data = (await res.json()) as Inscriere[];
    setRows(data);
    setError("");
    return true;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [inscRes, cursRes, lectRes] = await Promise.all([
          apiFetch("/inscrieri"),
          apiFetch("/cursanti"),
          apiFetch("/lectori"),
        ]);
        if (cancelled) return;

        if (inscRes.status === 401 || cursRes.status === 401) {
          router.replace("/login");
          return;
        }
        if (inscRes.status === 403) {
          router.replace("/cursanti");
          return;
        }
        if (!inscRes.ok) {
          setError("Could not load enrollments.");
          return;
        }
        setRows((await inscRes.json()) as Inscriere[]);

        if (cursRes.ok) {
          setCursanti((await cursRes.json()) as Cursant[]);
        }
        if (lectRes.ok) {
          setLectori((await lectRes.json()) as Lector[]);
        }
      } catch {
        if (!cancelled) setError("Could not load enrollments.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (formPending) return;
    setFormError("");
    setBackfillMsg("");
    setFormPending(true);
    try {
      const pretN = Number(pret);
      const body: {
        cursant_cod: string;
        lector_username: string;
        pret?: number;
        start_la?: string;
      } = {
        cursant_cod: cursantCod.trim(),
        lector_username: lectorUsername.trim(),
        start_la: startLa.trim() || todayYmd(),
      };
      if (Number.isFinite(pretN)) body.pret = pretN;
      else body.pret = 1500;

      const res = await apiFetch("/inscrieri", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (res.status === 400) {
        setFormError("Choose student and lecturer.");
        return;
      }
      if (!res.ok) {
        setFormError("Could not create enrollment.");
        return;
      }
      setCursantCod("");
      setLectorUsername("");
      setPret("1500");
      setStartLa(todayYmd());
      await loadList();
    } catch {
      setFormError("Could not create enrollment.");
    } finally {
      setFormPending(false);
    }
  }

  async function onBackfill() {
    if (backfillPending) return;
    setBackfillPending(true);
    setBackfillMsg("");
    setFormError("");
    setError("");
    try {
      const res = await apiFetch("/inscrieri/backfill", { method: "POST" });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        setError("Could not fill from assignments.");
        return;
      }
      const json = (await res.json()) as { created?: number };
      const n = Number(json.created ?? 0);
      setBackfillMsg(
        n === 0 ? "Nothing to fill." : `Created ${n} enrollments.`,
      );
      await loadList();
    } catch {
      setError("Could not fill from assignments.");
    } finally {
      setBackfillPending(false);
    }
  }

  async function onRefund(r: Inscriere) {
    if (r.id == null || actionId != null) return;
    if (!confirm(`Refund pentru ${r.cursant_cod}?`)) return;
    setActionId(r.id);
    setError("");
    try {
      const res = await apiFetch(`/inscrieri/${r.id}/refund`, { method: "POST" });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        setError("Could not mark refund.");
        return;
      }
      await loadList();
    } catch {
      setError("Could not mark refund.");
    } finally {
      setActionId(null);
    }
  }

  async function onPlatitLector(r: Inscriere) {
    if (r.id == null || actionId != null) return;
    if (!confirm(`Mark paid to lecturer for ${r.cursant_cod}?`)) return;
    setActionId(r.id);
    setError("");
    try {
      const res = await apiFetch(`/inscrieri/${r.id}/platit-lector`, {
        method: "POST",
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        setError("Could not mark payment.");
        return;
      }
      await loadList();
    } catch {
      setError("Could not mark payment.");
    } finally {
      setActionId(null);
    }
  }

  const inputCls =
    "rounded-md border border-line bg-surface px-3 py-2.5 outline-none ring-honey/40 focus:ring-2";

  return (
    <>
      <header className="lab-utility-row flex shrink-0 items-center gap-3 px-4 sm:px-6">
        <h1
          className="shrink-0 text-sm font-semibold text-accent"
          style={{ fontFamily: "var(--font-fraunces), serif" }}
        >
          Enrollments
        </h1>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={backfillPending}
            onClick={() => void onBackfill()}
            className="inline-flex h-8 items-center rounded-md border border-[#E8E2D6] bg-white px-2.5 text-xs font-medium text-accent transition hover:border-accent/40 disabled:opacity-60"
          >
            {backfillPending ? "Filling…" : "Fill from assignments"}
          </button>
          <button
            type="button"
            onClick={() => setNewOpen((v) => !v)}
            aria-expanded={newOpen}
            className="inline-flex h-8 shrink-0 items-center rounded-md bg-accent px-2.5 text-xs font-medium text-white transition hover:bg-accent/90"
          >
            {newOpen ? "Close" : "+ New enrollment"}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 sm:px-6">
      {backfillMsg ? (
        <p className="mb-3 text-sm text-foreground/65">{backfillMsg}</p>
      ) : null}
      {newOpen ? (
        <div className="nou-cursant mb-4">
          <div className="flex items-center justify-between px-4 pt-3 pb-1">
            <span className="text-[13px] font-semibold text-foreground">
              New enrollment
            </span>
          </div>
        <form
          onSubmit={onCreate}
          className="grid gap-4 px-4 pb-4 pt-3 sm:grid-cols-2"
        >
          <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
            <span className="font-medium text-accent">Student</span>
            <select
              value={cursantCod}
              onChange={(e) => {
                const cod = e.target.value;
                setCursantCod(cod);
                const c = cursanti.find((x) => x.cod === cod);
                const lec = (c?.lector || "").trim();
                if (!lec) return;
                const match = lectori.find(
                  (L) =>
                    L.username.toLowerCase() === lec.toLowerCase() ||
                    (L.name || "").trim().toLowerCase() === lec.toLowerCase(),
                );
                setLectorUsername(match?.username || lec);
              }}
              required
              className={inputCls}
            >
              <option value="">— choose —</option>
              {cursanti.map((c) => (
                <option key={c.cod} value={c.cod}>
                  {c.cod} — {c.nume}
                  {c.lector ? ` (${c.lector})` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
            <span className="font-medium text-accent">Lecturer</span>
            <select
              value={lectorUsername}
              onChange={(e) => setLectorUsername(e.target.value)}
              required
              className={inputCls}
            >
              <option value="">— choose —</option>
              {lectori.map((L) => (
                <option key={L.id} value={L.username}>
                  {L.name || L.username} ({L.username})
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-accent">Price</span>
            <input
              type="number"
              min={0}
              step="1"
              value={pret}
              onChange={(e) => setPret(e.target.value)}
              className={inputCls}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-accent">Start</span>
            <input
              type="date"
              value={startLa}
              onChange={(e) => setStartLa(e.target.value)}
              className={inputCls}
            />
          </label>

          {formError ? (
            <p className="text-sm text-red-800 sm:col-span-2" role="alert">
              {formError}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button
              type="submit"
              disabled={formPending}
              className="rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-[#F4EFE6] transition hover:brightness-110 disabled:opacity-60"
            >
              {formPending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
        </div>
      ) : null}

      {error ? (
        <p className="mb-4 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      {rows === null && !error ? (
        <p className="text-sm text-foreground/60">Loading…</p>
      ) : null}

      {rows ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line text-accent">
                <th className="py-2 pr-3 font-semibold">Code</th>
                <th className="py-2 pr-3 font-semibold">Name</th>
                <th className="py-2 pr-3 font-semibold">Lecturer</th>
                <th className="py-2 pr-3 font-semibold">Price</th>
                <th className="py-2 pr-3 font-semibold">Lecturer share</th>
                <th className="py-2 pr-3 font-semibold">Payment</th>
                <th className="py-2 pr-3 font-semibold">Start</th>
                <th className="py-2 pr-3 font-semibold">Refund until</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-6 text-foreground/60">
                    No enrollment. Use the form or “Fill from assignments”.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const busy = r.id != null && actionId === r.id;
                  const isRefund = r.status === "refund";
                  const paidLector = Number(r.platit_lector) === 1;
                  return (
                    <tr
                      key={r.id ?? `a-${r.cursant_cod}`}
                      className="border-b border-line/70 align-top"
                    >
                      <td className="py-2.5 pr-3 font-medium text-accent">
                        {r.cursant_cod}
                      </td>
                      <td className="py-2.5 pr-3">{r.cursant_nume || "—"}</td>
                      <td className="py-2.5 pr-3">{r.lector_username}</td>
                      <td className="py-2.5 pr-3 tabular-nums">
                        {fmtMoney(r.pret)}
                      </td>
                      <td className="py-2.5 pr-3 tabular-nums">
                        {fmtMoney(r.parte_lector)}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-foreground/70">
                        {modPlataLabel(r.mod_plata)}
                      </td>
                      <td className="py-2.5 pr-3 tabular-nums">
                        {r.start_la || "—"}
                      </td>
                      <td className="py-2.5 pr-3 tabular-nums">
                        {r.refund_pana || "—"}
                      </td>
                      <td className="py-2.5 pr-3">{r.status}</td>
                      <td className="py-2.5">
                        {r.id == null ? (
                          <span className="text-xs text-foreground/45">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-3">
                            {!isRefund ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void onRefund(r)}
                                className="text-sm font-medium text-red-800 underline-offset-2 hover:underline disabled:opacity-60"
                              >
                                {busy ? "…" : "Refund"}
                              </button>
                            ) : null}
                            {!isRefund && !paidLector ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void onPlatitLector(r)}
                                className="text-sm font-medium text-accent underline-offset-2 hover:underline disabled:opacity-60"
                              >
                                {busy ? "…" : "Mark paid to lecturer"}
                              </button>
                            ) : null}
                            {paidLector && !isRefund ? (
                              <span className="text-xs text-foreground/45">
                                paid to lecturer
                              </span>
                            ) : null}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : null}
      </main>
      </div>
    </>
  );
}
