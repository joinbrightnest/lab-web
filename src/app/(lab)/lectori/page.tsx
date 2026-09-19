"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, type Lector } from "@/lib/api";

function onorariuLabel(r: Lector) {
  const tip = (r.onorariu_tip || "fix_per_student").trim();
  const val = Number(r.onorariu_valoare ?? 500);
  if (tip === "procent") return `${val}%`;
  return `${val} lei`;
}

function modPlataLabel(m?: string | null) {
  const v = (m || "transfer").trim().toLowerCase();
  if (v === "stripe") return "Stripe";
  if (v === "altul") return "Altul";
  return "Transfer";
}

const emptyEdit = {
  name: "",
  password: "",
  telefon: "",
  email: "",
  iban: "",
  program: "",
  cap_max: "10",
  onorariu_tip: "fix_per_student",
  onorariu_valoare: "500",
  refund_zile: "7",
  slot_grup: "",
  onboarding_ok: false,
  mod_plata: "transfer",
  plata_nota: "",
};

export default function LectoriPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Lector[] | null>(null);
  const [error, setError] = useState("");

  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [pending, setPending] = useState(false);

  const [editUser, setEditUser] = useState<string | null>(null);
  const [edit, setEdit] = useState(emptyEdit);
  const [editError, setEditError] = useState("");
  const [editPending, setEditPending] = useState(false);
  const [delPending, setDelPending] = useState<number | null>(null);
  const [obPending, setObPending] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  async function loadList() {
    const res = await apiFetch("/lectori");
    if (res.status === 401) {
      router.replace("/login");
      return false;
    }
    if (res.status === 403) {
      router.replace("/cursanti");
      return false;
    }
    if (!res.ok) {
      setError("Could not load lecturers.");
      return false;
    }
    const data = (await res.json()) as Lector[];
    setRows(data);
    setError("");
    return true;
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await apiFetch("/lectori");
        if (cancelled) return;
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (res.status === 403) {
          router.replace("/cursanti");
          return;
        }
        if (!res.ok) {
          setError("Could not load lecturers.");
          return;
        }
        const data = (await res.json()) as Lector[];
        setRows(data);
      } catch {
        if (!cancelled) setError("Could not load lecturers.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setFormError("");
    setPending(true);
    try {
      const res = await apiFetch("/lectori", {
        method: "POST",
        body: JSON.stringify({
          username: username.trim(),
          name: name.trim(),
          password,
        }),
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (res.status === 403) {
        setFormError("Only admin can add lecturers.");
        return;
      }
      if (res.status === 400) {
        setFormError("Fill in User, Name and Password.");
        return;
      }
      if (!res.ok) {
        setFormError("Could not create lecturer.");
        return;
      }
      setUsername("");
      setName("");
      setPassword("");
      try {
        await loadList();
      } catch {
        setError("Could not load lecturers.");
      }
    } catch {
      setFormError("Could not create lecturer.");
    } finally {
      setPending(false);
    }
  }

  function startEdit(r: Lector) {
    setEditUser(r.username);
    setEdit({
      name: r.name || "",
      password: "",
      telefon: r.telefon || "",
      email: r.email || "",
      iban: r.iban || "",
      program: r.program || "",
      cap_max: String(r.cap_max ?? 10),
      onorariu_tip: r.onorariu_tip || "fix_per_student",
      onorariu_valoare: String(r.onorariu_valoare ?? 500),
      refund_zile: String(r.refund_zile ?? 7),
      slot_grup: r.slot_grup || "",
      onboarding_ok: Number(r.onboarding_ok) === 1,
      mod_plata: ["transfer", "stripe", "altul"].includes(
        (r.mod_plata || "").trim().toLowerCase(),
      )
        ? (r.mod_plata || "transfer").trim().toLowerCase()
        : "transfer",
      plata_nota: r.plata_nota || "",
    });
    setEditError("");
  }

  function cancelEdit() {
    setEditUser(null);
    setEdit(emptyEdit);
    setEditError("");
  }

  async function onEdit(e: FormEvent) {
    e.preventDefault();
    if (!editUser || editPending) return;
    setEditError("");
    setEditPending(true);
    try {
      const body: Record<string, unknown> = {
        username: editUser,
        name: edit.name.trim(),
        telefon: edit.telefon.trim(),
        email: edit.email.trim(),
        iban: edit.iban.trim(),
        program: edit.program.trim(),
        cap_max: Number(edit.cap_max) || 10,
        onorariu_tip: edit.onorariu_tip,
        onorariu_valoare: Number(edit.onorariu_valoare) || 0,
        refund_zile: Number(edit.refund_zile) || 7,
        slot_grup: edit.slot_grup.trim(),
        onboarding_ok: edit.onboarding_ok ? 1 : 0,
        mod_plata: edit.mod_plata,
        plata_nota: edit.plata_nota.trim(),
      };
      if (edit.password !== "") body.password = edit.password;

      const res = await apiFetch("/lectori", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (res.status === 403) {
        setEditError("Doar admin poate edita lectori.");
        return;
      }
      if (res.status === 400) {
        setEditError("Fill in Name.");
        return;
      }
      if (res.status === 404) {
        setEditError("Lecturer does not exist.");
        return;
      }
      if (!res.ok) {
        setEditError("Could not save lecturer.");
        return;
      }
      cancelEdit();
      try {
        await loadList();
      } catch {
        setError("Could not load lecturers.");
      }
    } catch {
      setEditError("Could not save lecturer.");
    } finally {
      setEditPending(false);
    }
  }

  async function onToggleOnboarding(r: Lector) {
    if (obPending) return;
    setObPending(r.username);
    setError("");
    try {
      const res = await apiFetch("/lectori", {
        method: "POST",
        body: JSON.stringify({
          username: r.username,
          name: r.name || r.username,
          onboarding_ok: Number(r.onboarding_ok) === 1 ? 0 : 1,
        }),
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        setError("Could not update onboarding.");
        return;
      }
      await loadList();
    } catch {
      setError("Could not update onboarding.");
    } finally {
      setObPending(null);
    }
  }

  async function onDelete(r: Lector) {
    if (delPending != null) return;
    if (!confirm(`Delete lecturer ${r.username}?`)) return;
    setDelPending(r.id);
    setError("");
    try {
      const res = await apiFetch("/lector-del", {
        method: "POST",
        body: JSON.stringify({ id: r.id }),
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        setError("Could not delete lecturer.");
        return;
      }
      if (editUser === r.username) cancelEdit();
      try {
        await loadList();
      } catch {
        setError("Could not load lecturers.");
      }
    } catch {
      setError("Could not delete lecturer.");
    } finally {
      setDelPending(null);
    }
  }

  const inputCls =
    "rounded-md border border-line bg-surface px-3 py-2.5 outline-none ring-honey/40 focus:ring-2";

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
          Lecturers
        </h1>

        <button
          type="button"
          onClick={() => setNewOpen((v) => !v)}
          aria-expanded={newOpen}
          className="ml-auto inline-flex h-8 shrink-0 items-center rounded-md bg-accent px-2.5 text-xs font-medium text-white transition hover:bg-accent/90"
        >
          {newOpen ? "Close" : "+ New lecturer"}
        </button>
      </header>

      {newOpen ? (
        <div className="shrink-0 border-b border-[#EDE6D8] px-4 py-4 sm:px-6">
          <div className="nou-cursant">
            <div className="flex items-center justify-between px-4 pt-3 pb-1">
              <span className="text-[13px] font-semibold text-foreground">
                New lecturer
              </span>
            </div>
            <form
              onSubmit={onCreate}
              className="flex flex-col gap-4 px-4 pb-4 pt-2"
            >
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-accent">User</span>
                <input
                  name="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="off"
                  className={inputCls}
                />
              </label>

              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-accent">Nume</span>
                <input
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className={inputCls}
                />
              </label>

              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-accent">Password</span>
                <input
                  name="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className={inputCls}
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
                  {pending ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {error ? (
        <p
          className="shrink-0 px-4 pt-3 text-sm text-red-800 sm:px-6"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        {rows === null && !error ? (
          <p className="px-4 py-6 text-sm text-foreground/60 sm:px-6">
            Loading…
          </p>
        ) : null}

        {rows ? (
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-[#FFFCF7]">
              <tr className="border-b border-[#EDE6D8]">
                <th className="h-10 px-4 text-left text-[12px] font-semibold text-[#6B7280]">
                  Nume
                </th>
                <th className="h-10 px-4 text-left text-[12px] font-semibold text-[#6B7280]">
                  Username
                </th>
                <th className="h-10 px-4 text-left text-[12px] font-semibold text-[#6B7280]">
                  Telefon
                </th>
                <th className="h-10 px-4 text-left text-[12px] font-semibold text-[#6B7280]">
                  Email
                </th>
                <th className="h-10 px-4 text-left text-[12px] font-semibold text-[#6B7280]">
                  Cap
                </th>
                <th className="h-10 px-4 text-left text-[12px] font-semibold text-[#6B7280]">
                  Onorariu
                </th>
                <th className="h-10 px-4 text-left text-[12px] font-semibold text-[#6B7280]">
                  Payment
                </th>
                <th className="h-10 px-4 text-left text-[12px] font-semibold text-[#6B7280]">
                  Onboarding
                </th>
                <th className="h-10 px-4 text-left text-[12px] font-semibold text-[#6B7280]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-6 text-sm text-foreground/60"
                  >
                    No lecturers.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.id}
                    className={
                      editUser === r.username
                        ? "border-b border-[#EDE6D8] bg-[#F6F3EC]"
                        : "h-11 border-b border-[#EDE6D8] transition-colors hover:bg-[#F6F3EC]"
                    }
                  >
                    {editUser === r.username ? (
                      <td colSpan={9} className="px-4 py-4">
                        <form
                          onSubmit={onEdit}
                          className="grid max-w-2xl gap-3 sm:grid-cols-2"
                        >
                          <label className="flex flex-col gap-1.5 text-sm">
                            <span className="font-medium text-accent">Nume</span>
                            <input
                              value={edit.name}
                              onChange={(e) =>
                                setEdit({ ...edit, name: e.target.value })
                              }
                              required
                              className={inputCls}
                            />
                          </label>
                          <label className="flex flex-col gap-1.5 text-sm">
                            <span className="font-medium text-accent">
                              New password (empty = unchanged)
                            </span>
                            <input
                              type="password"
                              value={edit.password}
                              onChange={(e) =>
                                setEdit({ ...edit, password: e.target.value })
                              }
                              autoComplete="new-password"
                              className={inputCls}
                            />
                          </label>
                          <label className="flex flex-col gap-1.5 text-sm">
                            <span className="font-medium text-accent">
                              Telefon
                            </span>
                            <input
                              value={edit.telefon}
                              onChange={(e) =>
                                setEdit({ ...edit, telefon: e.target.value })
                              }
                              className={inputCls}
                            />
                          </label>
                          <label className="flex flex-col gap-1.5 text-sm">
                            <span className="font-medium text-accent">Email</span>
                            <input
                              type="email"
                              value={edit.email}
                              onChange={(e) =>
                                setEdit({ ...edit, email: e.target.value })
                              }
                              className={inputCls}
                            />
                          </label>
                          <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
                            <span className="font-medium text-accent">IBAN</span>
                            <input
                              value={edit.iban}
                              onChange={(e) =>
                                setEdit({ ...edit, iban: e.target.value })
                              }
                              className={inputCls}
                            />
                          </label>
                          <fieldset className="flex flex-col gap-2 text-sm sm:col-span-2">
                            <legend className="font-medium text-accent">
                              Payment mode
                            </legend>
                            <div className="flex flex-wrap gap-4">
                              {(
                                [
                                  ["transfer", "Transfer bancar"],
                                  ["stripe", "Stripe"],
                                  ["altul", "Altul"],
                                ] as const
                              ).map(([val, label]) => (
                                <label
                                  key={val}
                                  className="flex items-center gap-2"
                                >
                                  <input
                                    type="radio"
                                    name="mod_plata"
                                    value={val}
                                    checked={edit.mod_plata === val}
                                    onChange={() =>
                                      setEdit({ ...edit, mod_plata: val })
                                    }
                                  />
                                  <span>{label}</span>
                                </label>
                              ))}
                            </div>
                          </fieldset>
                          <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
                            <span className="font-medium text-accent">
                              Payment note
                            </span>
                            <input
                              value={edit.plata_nota}
                              onChange={(e) =>
                                setEdit({
                                  ...edit,
                                  plata_nota: e.target.value,
                                })
                              }
                              placeholder="Optional details"
                              className={inputCls}
                            />
                          </label>
                          <label className="flex flex-col gap-1.5 text-sm">
                            <span className="font-medium text-accent">
                              Program
                            </span>
                            <input
                              value={edit.program}
                              onChange={(e) =>
                                setEdit({ ...edit, program: e.target.value })
                              }
                              className={inputCls}
                            />
                          </label>
                          <label className="flex flex-col gap-1.5 text-sm">
                            <span className="font-medium text-accent">
                              Cap max
                            </span>
                            <input
                              type="number"
                              min={1}
                              value={edit.cap_max}
                              onChange={(e) =>
                                setEdit({ ...edit, cap_max: e.target.value })
                              }
                              className={inputCls}
                            />
                          </label>
                          <label className="flex flex-col gap-1.5 text-sm">
                            <span className="font-medium text-accent">
                              Onorariu tip
                            </span>
                            <select
                              value={edit.onorariu_tip}
                              onChange={(e) =>
                                setEdit({
                                  ...edit,
                                  onorariu_tip: e.target.value,
                                })
                              }
                              className={inputCls}
                            >
                              <option value="fix_per_student">
                                Fix / student
                              </option>
                              <option value="procent">Procent</option>
                            </select>
                          </label>
                          <label className="flex flex-col gap-1.5 text-sm">
                            <span className="font-medium text-accent">
                              Onorariu valoare
                            </span>
                            <input
                              type="number"
                              step="0.01"
                              value={edit.onorariu_valoare}
                              onChange={(e) =>
                                setEdit({
                                  ...edit,
                                  onorariu_valoare: e.target.value,
                                })
                              }
                              className={inputCls}
                            />
                          </label>
                          <label className="flex flex-col gap-1.5 text-sm">
                            <span className="font-medium text-accent">
                              Refund zile
                            </span>
                            <input
                              type="number"
                              min={0}
                              value={edit.refund_zile}
                              onChange={(e) =>
                                setEdit({
                                  ...edit,
                                  refund_zile: e.target.value,
                                })
                              }
                              className={inputCls}
                            />
                          </label>
                          <label className="flex flex-col gap-1.5 text-sm">
                            <span className="font-medium text-accent">
                              Slot grup
                            </span>
                            <input
                              value={edit.slot_grup}
                              onChange={(e) =>
                                setEdit({ ...edit, slot_grup: e.target.value })
                              }
                              className={inputCls}
                            />
                          </label>
                          <label className="flex items-center gap-2 text-sm sm:col-span-2">
                            <input
                              type="checkbox"
                              checked={edit.onboarding_ok}
                              onChange={(e) =>
                                setEdit({
                                  ...edit,
                                  onboarding_ok: e.target.checked,
                                })
                              }
                            />
                            <span className="font-medium text-accent">
                              Onboarding OK
                            </span>
                          </label>
                          {editError ? (
                            <p
                              className="text-sm text-red-800 sm:col-span-2"
                              role="alert"
                            >
                              {editError}
                            </p>
                          ) : null}
                          <div className="flex flex-wrap gap-2 sm:col-span-2">
                            <button
                              type="submit"
                              disabled={editPending}
                              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-[#F4EFE6] transition hover:brightness-110 disabled:opacity-60"
                            >
                              {editPending ? "Saving…" : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              disabled={editPending}
                              className="rounded-md border border-line px-4 py-2 text-sm font-medium text-accent transition hover:bg-surface disabled:opacity-60"
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      </td>
                    ) : (
                      <>
                        <td className="px-4 text-left text-[14px] font-semibold text-[#2C5F45]">
                          {r.name || "—"}
                        </td>
                        <td className="px-4 text-[13px] text-[#3D3D3D]">
                          {r.username}
                        </td>
                        <td className="px-4 text-[13px] text-[#3D3D3D]">
                          {r.telefon || "—"}
                        </td>
                        <td className="px-4 text-[13px] text-[#3D3D3D]">
                          {r.email || "—"}
                        </td>
                        <td className="px-4 text-[13px] tabular-nums text-[#3D3D3D]">
                          {r.nr_cursanti ?? 0}/{r.cap_max ?? 10}
                        </td>
                        <td className="px-4 text-[13px] text-[#3D3D3D]">
                          {onorariuLabel(r)}
                        </td>
                        <td
                          className="px-4 text-[13px] text-[#3D3D3D]"
                          title={
                            r.plata_nota?.trim()
                              ? `${modPlataLabel(r.mod_plata)} — ${r.plata_nota}`
                              : modPlataLabel(r.mod_plata)
                          }
                        >
                          {modPlataLabel(r.mod_plata)}
                        </td>
                        <td className="px-4">
                          <input
                            type="checkbox"
                            checked={Number(r.onboarding_ok) === 1}
                            disabled={obPending === r.username}
                            onChange={() => void onToggleOnboarding(r)}
                            aria-label={`Onboarding ${r.username}`}
                          />
                        </td>
                        <td className="px-4">
                          <div className="flex flex-wrap items-center gap-3">
                            <button
                              type="button"
                              onClick={() => startEdit(r)}
                              className="text-[13px] text-[#2C5F45] hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              disabled={delPending === r.id}
                              onClick={() => void onDelete(r)}
                              className="text-[13px] text-[#B42318] hover:underline disabled:opacity-60"
                            >
                              {delPending === r.id ? "…" : "Delete"}
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}
