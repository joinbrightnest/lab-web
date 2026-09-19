"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, type Cursant, type Lector, type Me } from "@/lib/api";
import {
  calcSemafor,
  sortCursantiBySemafor,
  type SemaforCuloare,
} from "@/lib/semafor";

const DOT: Record<SemaforCuloare, string> = {
  verde: "bg-[#2C5F45]",
  galben: "bg-[#D4A017]",
  rosu: "bg-[#B42318]",
};

function SemaforDot({ row }: { row: Cursant }) {
  const s = calcSemafor(row);
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${DOT[s.culoare]}`}
      title={s.tooltip}
      aria-label={s.tooltip}
    />
  );
}

function formatUpdated(raw?: string | null) {
  const v = (raw || "").trim();
  if (!v) return "—";
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return v;
}

export default function CursantiPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Cursant[] | null>(null);
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  const [lectori, setLectori] = useState<Lector[]>([]);
  const [nume, setNume] = useState("");
  const [lector, setLector] = useState("");
  const [ritm, setRitm] = useState("");
  const [usernameStudent, setUsernameStudent] = useState("");
  const [passwordStudent, setPasswordStudent] = useState("");
  const [formError, setFormError] = useState("");
  const [pending, setPending] = useState(false);
  const [delPending, setDelPending] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const sortedRows = useMemo(
    () => (rows ? sortCursantiBySemafor(rows) : null),
    [rows],
  );

  async function loadList() {
    const listRes = await apiFetch("/cursanti");
    if (listRes.status === 401) {
      window.location.href = "/login";
      return false;
    }
    if (!listRes.ok) {
      setError("Could not load students.");
      return false;
    }
    const data = (await listRes.json()) as Cursant[];
    setRows(data);
    setError("");
    return true;
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // Auth first — never render the table on 401.
        const meRes = await apiFetch("/me", {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
        });
        if (meRes.status === 401) {
          window.location.href = "/login";
          return;
        }

        if (meRes.ok) {
          const me = (await meRes.json()) as Me;
          if (!cancelled) setIsAdmin(me.role === "admin");
          if (me.role === "admin") {
            const lectRes = await apiFetch("/lectori");
            if (lectRes.status === 401) {
              window.location.href = "/login";
              return;
            }
            if (lectRes.ok) {
              const lectData = (await lectRes.json()) as Lector[];
              if (!cancelled) setLectori(lectData);
            }
          }
        }

        if (cancelled) return;

        const listRes = await apiFetch("/cursanti");
        if (listRes.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!listRes.ok) {
          if (!cancelled) setError("Could not load students.");
          return;
        }
        const data = (await listRes.json()) as Cursant[];
        if (!cancelled) setRows(data);
      } catch {
        if (!cancelled) setError("Could not load students.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onDelete(r: Cursant) {
    if (!isAdmin || delPending) return;
    if (!confirm(`Delete student ${r.cod} — ${r.nume}?`)) return;
    setDelPending(r.cod);
    setError("");
    try {
      const res = await apiFetch("/cursant-del", {
        method: "POST",
        body: JSON.stringify({ cod: r.cod }),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) {
        setError("Could not delete student.");
        return;
      }
      try {
        await loadList();
      } catch {
        setError("Could not load students.");
      }
    } catch {
      setError("Could not delete student.");
    } finally {
      setDelPending(null);
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setFormError("");
    setPending(true);
    try {
      const body: {
        nume: string;
        lector: string;
        ritm_zile?: string;
        username_student?: string;
        password_student?: string;
      } = {
        nume: nume.trim(),
        lector,
      };
      const ritmTrim = ritm.trim();
      if (ritmTrim !== "") body.ritm_zile = ritmTrim;
      const userTrim = usernameStudent.trim();
      if (userTrim !== "") body.username_student = userTrim;
      const passTrim = passwordStudent.trim();
      if (passTrim !== "") body.password_student = passTrim;

      const res = await apiFetch("/cursant", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (res.status === 403) {
        setFormError("Only admin can add students.");
        return;
      }
      if (res.status === 409) {
        const json = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setFormError(json?.error || "Username-ul student este deja folosit.");
        return;
      }
      if (!res.ok) {
        setFormError("Could not add student.");
        return;
      }
      const json = (await res.json()) as { ok?: boolean; cod?: string };
      if (!json.cod) {
        setFormError("Could not add student.");
        return;
      }
      router.push("/dosar/" + json.cod);
    } catch {
      setFormError("Could not add student.");
    } finally {
      setPending(false);
    }
  }

  const colCount = isAdmin ? 6 : 5;

  return (
    <div
      data-index-page
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <header className="lab-utility-row flex shrink-0 items-center gap-3 px-4 sm:px-6">
        <h1
          className="shrink-0 text-sm font-semibold text-accent"
          style={{ fontFamily: "var(--font-fraunces), serif" }}
        >
          Students
        </h1>

        {isAdmin ? (
          <button
            type="button"
            onClick={() => setNewOpen((v) => !v)}
            aria-expanded={newOpen}
            className="ml-auto inline-flex h-8 shrink-0 items-center rounded-md bg-accent px-2.5 text-xs font-medium text-white transition hover:bg-accent/90"
          >
            {newOpen ? "Close" : "+ New student"}
          </button>
        ) : null}
      </header>

      {isAdmin && newOpen ? (
        <div className="shrink-0 border-b border-[#EDE6D8] px-4 py-4 sm:px-6">
          <div className="nou-cursant">
            <div className="flex items-center justify-between px-4 pt-3 pb-1">
              <span className="text-[13px] font-semibold text-foreground">
                New student
              </span>
            </div>
            <form
              onSubmit={onCreate}
              className="flex flex-col gap-4 px-4 pb-4 pt-2"
            >
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
                  Mission days (empty = default)
                </span>
                <input
                  name="ritm_zile"
                  type="number"
                  min={1}
                  value={ritm}
                  onChange={(e) => setRitm(e.target.value)}
                  placeholder="default"
                  className="w-full max-w-[12rem] rounded-md border border-line bg-surface px-3 py-2.5 outline-none ring-honey/40 focus:ring-2"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-accent">Student user</span>
                <input
                  name="username_student"
                  autoComplete="off"
                  value={usernameStudent}
                  onChange={(e) => setUsernameStudent(e.target.value)}
                  placeholder="optional (default = code)"
                  className="rounded-md border border-line bg-surface px-3 py-2.5 outline-none ring-honey/40 focus:ring-2"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-accent">Student password</span>
                <input
                  name="password_student"
                  type="password"
                  autoComplete="new-password"
                  value={passwordStudent}
                  onChange={(e) => setPasswordStudent(e.target.value)}
                  placeholder="optional"
                  className="rounded-md border border-line bg-surface px-3 py-2.5 outline-none ring-honey/40 focus:ring-2"
                />
              </label>

              {formError ? (
                <p className="text-sm text-red-800" role="alert">
                  {formError}
                </p>
              ) : null}

              <div>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-[#F4EFE6] transition hover:brightness-110 disabled:opacity-60"
                >
                  {pending ? "Adding…" : "Add"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="shrink-0 px-4 pt-3 text-sm text-red-800 sm:px-6" role="alert">
          {error}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        {rows === null && !error ? (
          <p className="px-4 py-6 text-sm text-foreground/60 sm:px-6">
            Loading…
          </p>
        ) : null}

        {sortedRows ? (
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-[#FFFCF7]">
              <tr className="border-b border-[#EDE6D8]">
                <th className="h-10 px-4 text-left text-[12px] font-semibold text-[#6B7280]">
                  Code
                </th>
                <th className="h-10 px-4 text-left text-[12px] font-semibold text-[#6B7280]">
                  Name
                </th>
                <th className="h-10 px-4 text-left text-[12px] font-semibold text-[#6B7280]">
                  Level
                </th>
                <th className="h-10 px-4 text-left text-[12px] font-semibold text-[#6B7280]">
                  Lecturer
                </th>
                <th className="h-10 px-4 text-left text-[12px] font-semibold text-[#6B7280]">
                  Updated
                </th>
                {isAdmin ? (
                  <th className="h-10 px-4 text-left text-[12px] font-semibold text-[#6B7280]">
                    Actions
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={colCount}
                    className="px-4 py-6 text-sm text-foreground/60"
                  >
                    No students yet.
                  </td>
                </tr>
              ) : (
                sortedRows.map((r) => {
                  const href = `/dosar/${encodeURIComponent(r.cod)}`;
                  return (
                    <tr
                      key={r.cod}
                      role="link"
                      tabIndex={0}
                      onClick={() => router.push(href)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(href);
                        }
                      }}
                      className="h-11 cursor-pointer border-b border-[#EDE6D8] transition-colors hover:bg-[#F6F3EC]"
                    >
                      <td className="px-4 text-[13px] tabular-nums text-[#6B6B6B]">
                        {r.cod}
                      </td>
                      <td className="px-4">
                        <span className="inline-flex items-center gap-2">
                          <SemaforDot row={r} />
                          <Link
                            href={href}
                            onClick={(e) => e.stopPropagation()}
                            className="text-[14px] font-semibold text-[#2C5F45] hover:underline"
                          >
                            {r.nume}
                          </Link>
                        </span>
                      </td>
                      <td className="px-4 text-[13px] text-[#3D3D3D]">
                        {r.nivel || "—"}
                      </td>
                      <td className="px-4 text-[13px] text-[#3D3D3D]">
                        {r.lector || "—"}
                      </td>
                      <td className="px-4 text-[13px] tabular-nums text-[#6B6B6B]">
                        {formatUpdated(r.ultimul_update)}
                      </td>
                      {isAdmin ? (
                        <td className="px-4">
                          <button
                            type="button"
                            disabled={delPending === r.cod}
                            onClick={(e) => {
                              e.stopPropagation();
                              void onDelete(r);
                            }}
                            className="text-[13px] text-[#B42318] hover:underline disabled:opacity-60"
                          >
                            {delPending === r.cod ? "…" : "Delete"}
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}
