"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  apiFetch,
  type Disponibilitate,
  type EuIncasari,
  type Inscriere,
  type Lector,
} from "@/lib/api";

// zi_sapt ISO-8601: 1=Mon … 7=Sun (integer; matches Flask)
const ZI_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

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

function fmtWindow(d: Disponibilitate) {
  // zi_sapt 1=Mon … 7=Sun
  const zi = ZI_LABELS[d.zi_sapt - 1] ?? `Day ${d.zi_sapt}`;
  return `${zi} ${d.start_hm}–${d.end_hm}`;
}

export default function EuPage() {
  const router = useRouter();
  const [eu, setEu] = useState<Lector | null>(null);
  const [mine, setMine] = useState<Inscriere[] | null>(null);
  const [incasari, setIncasari] = useState<EuIncasari | null>(null);
  const [disponib, setDisponib] = useState<Disponibilitate[] | null>(null);
  const [error, setError] = useState("");
  const [telefon, setTelefon] = useState("");
  const [email, setEmail] = useState("");
  const [iban, setIban] = useState("");
  const [modPlata, setModPlata] = useState("transfer");
  const [plataNota, setPlataNota] = useState("");
  const [saveError, setSaveError] = useState("");
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  const [ziSapt, setZiSapt] = useState(1); // ISO: 1=Mon
  const [startHm, setStartHm] = useState("10:00");
  const [endHm, setEndHm] = useState("18:00");
  const [dispError, setDispError] = useState("");
  const [dispPending, setDispPending] = useState(false);

  const loadDisponib = useCallback(async () => {
    const res = await apiFetch("/disponibilitate");
    if (res.status === 401) {
      router.replace("/login");
      return;
    }
    if (!res.ok) {
      setDisponib([]);
      return;
    }
    setDisponib((await res.json()) as Disponibilitate[]);
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [euRes, inscRes, incRes, dispRes] = await Promise.all([
          apiFetch("/eu"),
          apiFetch("/inscrieri"),
          apiFetch("/eu/incasari"),
          apiFetch("/disponibilitate"),
        ]);
        if (cancelled) return;

        if (
          euRes.status === 401 ||
          inscRes.status === 401 ||
          incRes.status === 401
        ) {
          router.replace("/login");
          return;
        }
        if (euRes.status === 403) {
          router.replace("/cursanti");
          return;
        }
        if (!euRes.ok) {
          setError("Could not load profile.");
          return;
        }

        const euData = (await euRes.json()) as Lector;
        if (euData.role === "admin") {
          router.replace("/lectori");
          return;
        }
        setEu(euData);
        setTelefon(euData.telefon || "");
        setEmail(euData.email || "");
        setIban(euData.iban || "");
        setModPlata(
          ["transfer", "stripe", "altul"].includes(
            (euData.mod_plata || "").trim().toLowerCase(),
          )
            ? (euData.mod_plata || "transfer").trim().toLowerCase()
            : "transfer",
        );
        setPlataNota(euData.plata_nota || "");

        if (inscRes.ok) {
          setMine((await inscRes.json()) as Inscriere[]);
        } else {
          setMine([]);
        }

        if (incRes.ok) {
          setIncasari((await incRes.json()) as EuIncasari);
        } else {
          setIncasari({ items: [], total: 0 });
        }

        if (dispRes.ok) {
          setDisponib((await dispRes.json()) as Disponibilitate[]);
        } else {
          setDisponib([]);
        }
      } catch {
        if (!cancelled) setError("Could not load page.");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function onSaveContact(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setSaveError("");
    setSaved(false);
    setPending(true);
    try {
      const res = await apiFetch("/eu", {
        method: "POST",
        body: JSON.stringify({
          telefon: telefon.trim(),
          email: email.trim(),
          iban: iban.trim(),
          mod_plata: modPlata,
          plata_nota: plataNota.trim(),
        }),
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        setSaveError("Could not save contact.");
        return;
      }
      const json = (await res.json()) as { eu?: Lector };
      if (json.eu) {
        setEu(json.eu);
        setTelefon(json.eu.telefon || "");
        setEmail(json.eu.email || "");
        setIban(json.eu.iban || "");
        setModPlata(
          ["transfer", "stripe", "altul"].includes(
            (json.eu.mod_plata || "").trim().toLowerCase(),
          )
            ? (json.eu.mod_plata || "transfer").trim().toLowerCase()
            : "transfer",
        );
        setPlataNota(json.eu.plata_nota || "");
      }
      setSaved(true);
    } catch {
      setSaveError("Could not save contact.");
    } finally {
      setPending(false);
    }
  }

  async function onAddDisponib(e: FormEvent) {
    e.preventDefault();
    if (dispPending) return;
    setDispError("");
    setDispPending(true);
    try {
      const res = await apiFetch("/disponibilitate", {
        method: "POST",
        body: JSON.stringify({
          zi_sapt: ziSapt,
          start_hm: startHm,
          end_hm: endHm,
        }),
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        setDispError("Could not add window.");
        return;
      }
      await loadDisponib();
    } catch {
      setDispError("Could not add window.");
    } finally {
      setDispPending(false);
    }
  }

  async function onDeleteDisponib(id: number) {
    setDispError("");
    try {
      const res = await apiFetch(`/disponibilitate/${id}`, { method: "DELETE" });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        setDispError("Could not delete.");
        return;
      }
      setDisponib((prev) => (prev || []).filter((d) => d.id !== id));
    } catch {
      setDispError("Could not delete.");
    }
  }

  const inputCls =
    "rounded-md border border-line bg-surface px-3 py-2.5 outline-none ring-honey/40 focus:ring-2";

  return (
    <>
      <header className="lab-utility-row flex shrink-0 items-center px-4 sm:px-6">
        <h1
          className="text-sm font-semibold text-accent"
          style={{ fontFamily: "var(--font-fraunces), serif" }}
        >
          Me
        </h1>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-4 py-6 sm:px-6">
      {error ? (
        <p className="text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      {!eu && !error ? (
        <p className="text-sm text-foreground/60">Loading…</p>
      ) : null}

      {eu ? (
        <section>
          <h2
            className="mb-3 text-lg font-semibold text-accent"
            style={{ fontFamily: "var(--font-fraunces), serif" }}
          >
            Contact
          </h2>
          <form onSubmit={onSaveContact} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-accent">Telefon</span>
              <input
                value={telefon}
                onChange={(e) => setTelefon(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-accent">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-accent">IBAN</span>
              <input
                value={iban}
                onChange={(e) => setIban(e.target.value)}
                className={inputCls}
              />
            </label>
            <fieldset className="flex flex-col gap-2 text-sm">
              <legend className="font-medium text-accent">Payment mode</legend>
              <div className="flex flex-wrap gap-4">
                {(
                  [
                    ["transfer", "Transfer bancar"],
                    ["stripe", "Stripe"],
                    ["altul", "Altul"],
                  ] as const
                ).map(([val, label]) => (
                  <label key={val} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="mod_plata"
                      value={val}
                      checked={modPlata === val}
                      onChange={() => setModPlata(val)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-accent">Payment note</span>
              <input
                value={plataNota}
                onChange={(e) => setPlataNota(e.target.value)}
                placeholder="Optional details"
                className={inputCls}
              />
            </label>
            <p className="text-sm text-foreground/60">
              Slot:{" "}
              <span className="text-foreground">
                {eu.slot_grup?.trim() || "—"}
              </span>
            </p>
            {saveError ? (
              <p className="text-sm text-red-800" role="alert">
                {saveError}
              </p>
            ) : null}
            {saved ? (
              <p className="text-sm text-accent">Saved.</p>
            ) : null}
            <div>
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-[#F4EFE6] transition hover:brightness-110 disabled:opacity-60"
              >
                {pending ? "Saving…" : "Save contact"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {eu ? (
        <section>
          <h2
            className="mb-1 text-lg font-semibold text-accent"
            style={{ fontFamily: "var(--font-fraunces), serif" }}
          >
            Call hours
          </h2>
          <p className="mb-3 text-sm text-foreground/60">
            Students can only book inside these windows.
          </p>
          {disponib === null ? (
            <p className="text-sm text-foreground/60">Loading…</p>
          ) : disponib.length === 0 ? (
            <p className="mb-4 text-sm text-foreground/70">
              Add when you take calls. Students can only pick these hours.
            </p>
          ) : (
            <ul className="mb-4 flex flex-col gap-2">
              {disponib.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-3 border-b border-line/60 py-2 text-sm"
                >
                  <span className="tabular-nums text-foreground">
                    {fmtWindow(d)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void onDeleteDisponib(d.id)}
                    className="text-sm font-medium text-red-800 underline-offset-2 hover:underline"
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            onSubmit={onAddDisponib}
            className="flex flex-wrap items-end gap-3"
          >
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-accent">Day</span>
              <select
                value={ziSapt}
                onChange={(e) => setZiSapt(Number(e.target.value))}
                className={inputCls}
              >
                {ZI_LABELS.map((label, i) => (
                  <option key={label} value={i + 1}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-accent">Start</span>
              <input
                type="time"
                step={1800}
                value={startHm}
                onChange={(e) => setStartHm(e.target.value)}
                className={inputCls}
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-accent">End</span>
              <input
                type="time"
                step={1800}
                value={endHm}
                onChange={(e) => setEndHm(e.target.value)}
                className={inputCls}
                required
              />
            </label>
            <button
              type="submit"
              disabled={dispPending}
              className="rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-[#F4EFE6] transition hover:brightness-110 disabled:opacity-60"
            >
              {dispPending ? "Adding…" : "Add"}
            </button>
          </form>
          {dispError ? (
            <p className="mt-2 text-sm text-red-800" role="alert">
              {dispError}
            </p>
          ) : null}
        </section>
      ) : null}

      {mine ? (
        <section>
          <h2
            className="mb-3 text-lg font-semibold text-accent"
            style={{ fontFamily: "var(--font-fraunces), serif" }}
          >
            My students
          </h2>
          {mine.length === 0 ? (
            <p className="text-sm text-foreground/60">No students yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-accent">
                    <th className="py-2 pr-3 font-semibold">Name</th>
                    <th className="py-2 pr-3 font-semibold">Code</th>
                    <th className="py-2 pr-3 font-semibold">Start</th>
                    <th className="py-2 pr-3 font-semibold">Days left</th>
                    <th className="py-2 pr-3 font-semibold">Status</th>
                    <th className="py-2 font-semibold">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {mine.map((r) => (
                    <tr
                      key={r.id ?? `a-${r.cursant_cod}`}
                      className="border-b border-line/70"
                    >
                      <td className="py-2.5 pr-3">{r.cursant_nume || "—"}</td>
                      <td className="py-2.5 pr-3 font-medium text-accent">
                        {r.cursant_cod}
                      </td>
                      <td className="py-2.5 pr-3 tabular-nums">
                        {r.start_la || "—"}
                      </td>
                      <td className="py-2.5 pr-3 tabular-nums">
                        {r.zile_ramase == null ? "—" : r.zile_ramase}
                      </td>
                      <td className="py-2.5 pr-3">{r.status || "—"}</td>
                      <td className="py-2.5 tabular-nums">
                        {r.fara_contract || r.parte_lector == null
                          ? "—"
                          : fmtMoney(r.parte_lector)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {incasari ? (
        <section>
          <h2
            className="mb-3 text-lg font-semibold text-accent"
            style={{ fontFamily: "var(--font-fraunces), serif" }}
          >
            To collect
          </h2>
          {incasari.items.length === 0 ? (
            <p className="text-sm text-foreground/60">Nothing to collect.</p>
          ) : (
            <>
              <ul className="mb-3 space-y-2 text-sm">
                {incasari.items.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line/50 py-2"
                  >
                    <span>
                      {r.cursant_nume || r.cursant_cod}{" "}
                      <span className="text-foreground/45">
                        ({r.cursant_cod})
                      </span>
                    </span>
                    <span className="flex items-baseline gap-3">
                      <span
                        className="text-xs text-foreground/55"
                        title={modPlataLabel(r.mod_plata)}
                      >
                        {modPlataLabel(r.mod_plata)}
                      </span>
                      <span className="tabular-nums font-medium text-accent">
                        {fmtMoney(r.parte_lector)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-sm font-semibold text-accent">
                Total: {fmtMoney(incasari.total)}
              </p>
            </>
          )}
        </section>
      ) : null}
      </main>
      </div>
    </>
  );
}
