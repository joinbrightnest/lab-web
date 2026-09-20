"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  apiFetch,
  type DosarPayload,
  type MisiuneRow,
  type NotitaRow,
  type SkillRow,
  type UpdateRow,
} from "@/lib/api";
import { calcSemafor, type SemaforCuloare } from "@/lib/semafor";
import { useUpdateModal } from "@/components/UpdateModal";
import {
  NotitaModal,
  type NotitaModalMode,
} from "@/components/NotitaModal";
import { MisiuneMarkdown } from "@/components/MisiuneMarkdown";
import {
  MisiuneEditor,
  type MisiuneEditorHandle,
} from "@/components/MisiuneEditor";

type Tab = "prezent" | "activitate" | "misiune";
type MisiuneActiune = "aproba" | "skip" | "regenereaza" | "ciorna";
type ActivitateFilter = "toate" | "update" | "misiuni" | "notite";

type TimelineItem = {
  key: string;
  kind: "update" | "misiune" | "notita";
  /** Raw datetime for display + month grouping. */
  whenRaw: string;
  tip: string;
  title: string;
  body: string;
  sortKey: string;
  dimmed?: boolean;
  note?: NotitaRow;
};

const LUNI_RO = [
  "Ianuarie",
  "Februarie",
  "Martie",
  "Aprilie",
  "Mai",
  "Iunie",
  "Iulie",
  "August",
  "Septembrie",
  "Octombrie",
  "Noiembrie",
  "Decembrie",
] as const;

const LUNI_SCURT = [
  "ian",
  "feb",
  "mar",
  "apr",
  "mai",
  "iun",
  "iul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const;

const SEMAFOR_DOT: Record<SemaforCuloare, string> = {
  verde: "bg-[#2C5F45]",
  galben: "bg-[#D4A017]",
  rosu: "bg-red-700",
};

const SEMAFOR_LABEL: Record<SemaforCuloare, string> = {
  verde: "Green",
  galben: "Yellow",
  rosu: "Red",
};

const COL_SCROLL = "overflow-x-hidden overflow-y-auto";

function dash(v: string | number | null | undefined) {
  if (v === null || v === undefined || String(v).trim() === "") return "—";
  return String(v);
}

function initiala(nume: string) {
  const t = nume.trim();
  return t ? t[0]!.toUpperCase() : "?";
}

function skillNivelVal(s: SkillRow): number {
  if (s.nivel === null || s.nivel === undefined) return 0;
  const n = Number(s.nivel);
  return Number.isFinite(n) ? n : 0;
}

/** Same rule as backend skill_pentru_misiune: lowest nivel. */
function bottleneckSkill(skilluri: SkillRow[]): SkillRow | null {
  if (skilluri.length === 0) return null;
  let best: SkillRow | null = null;
  let bestVal: number | null = null;
  for (const s of skilluri) {
    const v = skillNivelVal(s);
    if (bestVal === null || v < bestVal) {
      bestVal = v;
      best = s;
    }
  }
  return best;
}

function aiRefFromMisiune(m: {
  textul?: string | null;
  rezultat?: string | null;
} | null): string {
  if (!m) return "";
  const rez = (m.rezultat || "").trim();
  if (rez) return m.rezultat || "";
  return m.textul || "";
}

function ActionIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

const IcoUpdate = (
  <ActionIcon>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </ActionIcon>
);

const IcoMisiune = (
  <ActionIcon>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="0.75" fill="currentColor" />
  </ActionIcon>
);

const IcoChat = (
  <ActionIcon>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </ActionIcon>
);

const IcoEdit = (
  <ActionIcon>
    <path d="M4 20h4L20 8l-4-4L4 16z" />
    <path d="M13 5l4 4" />
  </ActionIcon>
);

function ActionButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1 rounded-md px-1 py-2.5 text-center text-foreground/70 transition hover:bg-accent/[0.06] hover:text-accent disabled:opacity-50"
    >
      {icon}
      <span className="text-[11px] font-medium leading-none">{label}</span>
    </button>
  );
}

function TabBadge({ tip }: { tip: string | null | undefined }) {
  const label = dash(tip);
  return (
    <span className="inline-flex shrink-0 items-center rounded border border-line bg-background px-2 py-0.5 text-[11px] font-medium tracking-wide text-accent uppercase">
      {label}
    </span>
  );
}

function parseDateParts(raw: string | null | undefined): {
  day: string;
  hhmm: string | null;
  y: number;
  mo: number;
  d: number;
} | null {
  const t = (raw || "").trim();
  const m = t.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::\d{2})?)?/,
  );
  if (!m) return null;
  return {
    day: `${m[1]}-${m[2]}-${m[3]}`,
    hhmm: m[4] && m[5] ? `${m[4]}:${m[5]}` : null,
    y: Number(m[1]),
    mo: Number(m[2]),
    d: Number(m[3]),
  };
}

function todayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

/** e.g. "12 sep" or "12 sep · 22:14" */
function formatEventWhen(raw: string | null | undefined) {
  const p = parseDateParts(raw);
  if (!p) return (raw || "").trim() || "—";
  const label = `${p.d} ${LUNI_SCURT[p.mo - 1] ?? "—"}`;
  return p.hhmm ? `${label} · ${p.hhmm}` : label;
}

/** e.g. "14 sep" for reminder chips */
function formatDayShort(raw: string | null | undefined) {
  const p = parseDateParts(raw);
  if (!p) return (raw || "").trim() || "—";
  return `${p.d} ${LUNI_SCURT[p.mo - 1] ?? "—"}`;
}

function monthKey(raw: string | null | undefined) {
  const p = parseDateParts(raw);
  if (!p) return "0000-00";
  return `${String(p.y).padStart(4, "0")}-${String(p.mo).padStart(2, "0")}`;
}

function monthHeading(key: string) {
  const m = key.match(/^(\d{4})-(\d{2})$/);
  if (!m) return key;
  const mo = Number(m[2]);
  return `${LUNI_RO[mo - 1] ?? "—"} ${m[1]}`;
}

/** Sort key: datetime DESC, then id DESC. Date-only → T00:00:00. */
function eventSortKey(
  raw: string | null | undefined,
  id: number | string | null | undefined,
): string {
  const t = (raw || "").trim();
  const m = t.match(
    /^(\d{4}-\d{2}-\d{2})(?:[T\s](\d{2}:\d{2})(?::(\d{2}))?)?/,
  );
  let stamp: string;
  if (m) {
    const day = m[1]!;
    const hhmm = m[2] || "00:00";
    const ss = m[3] || "00";
    stamp = `${day}T${hhmm}:${ss}`;
  } else {
    stamp = "0000-00-00T00:00:00";
  }
  return `${stamp}\t${String(id ?? 0).padStart(12, "0")}`;
}

function buildTimeline(
  updateuri: UpdateRow[],
  misiuni: MisiuneRow[],
  notite: NotitaRow[],
): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (let i = 0; i < updateuri.length; i++) {
    const u = updateuri[i]!;
    const whenRaw = (u.data || "").trim();
    const tip = (u.tip || "Update").trim() || "Update";
    items.push({
      key: `u-${u.id ?? i}-${whenRaw}`,
      kind: "update",
      whenRaw,
      tip,
      title: tip,
      body: dash(u.feedback),
      sortKey: eventSortKey(u.data, u.id),
    });
  }

  for (let i = 0; i < misiuni.length; i++) {
    const m = misiuni[i]!;
    const status = (m.status || "").trim().toLowerCase();
    if (status !== "aprobata" && status !== "skip") continue;
    const whenRaw = (m.creat_la || "").trim();
    const isSkip = status === "skip";
    items.push({
      key: `m-${m.id ?? i}`,
      kind: "misiune",
      whenRaw,
      tip: status,
      title: isSkip ? "Mission skipped" : "Mission approved",
      body: dash(m.textul),
      dimmed: isSkip,
      sortKey: eventSortKey(m.creat_la, m.id),
    });
  }

  for (let i = 0; i < notite.length; i++) {
    const n = notite[i]!;
    const whenRaw = (n.creat_la || "").trim();
    items.push({
      key: `n-${n.id ?? i}`,
      kind: "notita",
      whenRaw,
      tip: "Note",
      title: "Note",
      body: dash(n.textul),
      sortKey: eventSortKey(n.creat_la, n.id),
      note: n,
    });
  }

  items.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  return items;
}

type ReminderItem = {
  note: NotitaRow;
  remDay: string;
  overdue: boolean;
};

function buildReminders(notite: NotitaRow[]): ReminderItem[] {
  const today = todayISO();
  const out: ReminderItem[] = [];
  for (const n of notite) {
    const rem = (n.reminder_la || "").trim();
    const p = parseDateParts(rem);
    if (!p) continue;
    out.push({
      note: n,
      remDay: p.day,
      overdue: p.day < today,
    });
  }
  out.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return a.remDay.localeCompare(b.remDay);
  });
  return out;
}

function groupTimelineByMonth(items: TimelineItem[]) {
  const map = new Map<string, TimelineItem[]>();
  for (const ev of items) {
    const key = monthKey(ev.whenRaw);
    const list = map.get(key);
    if (list) list.push(ev);
    else map.set(key, [ev]);
  }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

function TimelineGlyph({ kind }: { kind: TimelineItem["kind"] }) {
  const common = {
    viewBox: "0 0 24 24",
    width: 16,
    height: 16,
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
    className: "shrink-0 text-accent",
  };
  if (kind === "notita") {
    return (
      <svg {...common}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M8 13h8" />
        <path d="M8 17h6" />
      </svg>
    );
  }
  if (kind === "misiune") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4.5" />
        <circle cx="12" cy="12" r="0.75" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function DosarPageInner() {
  const router = useRouter();
  const params = useParams<{ cod: string }>();
  const searchParams = useSearchParams();
  const cod = decodeURIComponent(params.cod || "").trim();
  const { openUpdate } = useUpdateModal();

  const [data, setData] = useState<DosarPayload | null>(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [pending, setPending] = useState(false);
  const [tab, setTab] = useState<Tab>("prezent");
  const [activitateFilter, setActivitateFilter] =
    useState<ActivitateFilter>("toate");
  const [misiuneDraft, setMisiuneDraft] = useState("");
  const [aiText, setAiText] = useState("");
  const syncedMisiuneId = useRef<string | null>(null);
  const misiuneEditorRef = useRef<MisiuneEditorHandle | null>(null);
  const [notaModal, setNotaModal] = useState<NotitaModalMode | null>(null);
  const [notaPending, setNotaPending] = useState(false);
  const [notaError, setNotaError] = useState("");

  useEffect(() => {
    if (!cod) return;
    const tabParam = (searchParams.get("tab") || "").trim().toLowerCase();
    if (tabParam === "activitate" || tabParam === "misiune" || tabParam === "prezent") {
      setTab(tabParam);
    }
    if (searchParams.get("update") !== "1") return;
    openUpdate(cod, {
      onSaved: () => {
        void loadDosar();
      },
    });
    router.replace(`/dosar/${encodeURIComponent(cod)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cod, searchParams]);

  function syncMisiuneDraft(json: DosarPayload) {
    const m = json.misiune_activa;
    const idKey = m?.id != null ? String(m.id) : m ? "active" : "none";
    if (syncedMisiuneId.current === idKey) return;
    syncedMisiuneId.current = idKey;
    setMisiuneDraft(m?.textul || "");
    setAiText(aiRefFromMisiune(m));
  }

  async function loadDosar() {
    if (!cod) {
      setError("Missing COD.");
      return false;
    }

    try {
      const res = await apiFetch(`/dosar?cod=${encodeURIComponent(cod)}`);
      if (res.status === 401) {
        router.replace("/login");
        return false;
      }
      if (res.status === 404) {
        setError("Student not found.");
        return false;
      }
      if (res.status === 403) {
        setError("Nu ai acces la acest dosar.");
        return false;
      }
      if (!res.ok) {
        setError("Could not load dossier.");
        return false;
      }
      const json = (await res.json()) as DosarPayload;
      setData(json);
      syncedMisiuneId.current = null;
      syncMisiuneDraft(json);
      setError("");
      return true;
    } catch {
      setError("Could not load dossier.");
      return false;
    }
  }

  useEffect(() => {
    if (!cod) {
      setError("Missing COD.");
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
          setError("Student not found.");
          return;
        }
        if (res.status === 403) {
          setError("Nu ai acces la acest dosar.");
          return;
        }
        if (!res.ok) {
          setError("Could not load dossier.");
          return;
        }
        const json = (await res.json()) as DosarPayload;
        if (!cancelled) {
          setData(json);
          syncedMisiuneId.current = null;
          syncMisiuneDraft(json);
          setError("");
        }
      } catch {
        if (!cancelled) setError("Could not load dossier.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cod, router]);

  async function onMisiuneActiune(
    actiune: MisiuneActiune,
    opts?: { textul?: string },
  ) {
    if (!cod || pending) return;
    setActionError("");
    setPending(true);
    try {
      const body: Record<string, string> = { cod, actiune };
      if (opts && "textul" in opts) {
        body.textul = opts.textul ?? "";
      }
      const res = await apiFetch("/misiune", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        setActionError("Could not apply action.");
        return;
      }
      await loadDosar();
    } catch {
      setActionError("Could not apply action.");
    } finally {
      setPending(false);
    }
  }

  async function onSkillNivel(skillId: number, nivel: number) {
    if (!cod || pending) return;
    setActionError("");
    setPending(true);
    try {
      const res = await apiFetch("/skill-nivel", {
        method: "POST",
        body: JSON.stringify({ cod, skill_id: skillId, nivel }),
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        setActionError("Could not update skill.");
        return;
      }
      await loadDosar();
    } catch {
      setActionError("Could not update skill.");
    } finally {
      setPending(false);
    }
  }

  function goMisiune() {
    setTab("misiune");
  }

  function goChat() {
    if (!cod) {
      router.push("/chat");
      return;
    }
    router.push(`/chat?cod=${encodeURIComponent(cod)}`);
  }

  function goEditeaza() {
    if (!cod) return;
    router.push(`/edit?cod=${encodeURIComponent(cod)}`);
  }

  function readMisiuneEditorText() {
    const fromEditor = misiuneEditorRef.current?.getMarkdown();
    if (fromEditor !== undefined) {
      setMisiuneDraft(fromEditor);
      return fromEditor;
    }
    return misiuneDraft;
  }

  function onScrieTu() {
    setMisiuneDraft("");
  }

  function onRegenereaza() {
    const current = readMisiuneEditorText();
    const loaded = misiune?.textul || "";
    const dirty = current !== loaded;
    if (dirty) {
      const ok = window.confirm(
        "Mission text was edited. Regenerate and replace it?",
      );
      if (!ok) return;
    }
    void onMisiuneActiune("regenereaza");
  }

  function openNotaNew() {
    setNotaError("");
    setNotaModal({ kind: "new" });
  }

  function openNotaView(note: NotitaRow) {
    setNotaError("");
    setNotaModal({ kind: "view", note });
  }

  function closeNotaModal() {
    if (notaPending) return;
    setNotaModal(null);
    setNotaError("");
  }

  async function onSalveazaNota(payload: {
    textul: string;
    reminder_la?: string;
  }) {
    const textul = payload.textul.trim();
    if (!cod || !textul || notaPending) return;
    setNotaPending(true);
    setNotaError("");
    try {
      const body: { cod: string; textul: string; reminder_la?: string } = {
        cod,
        textul,
      };
      if (payload.reminder_la) body.reminder_la = payload.reminder_la;
      const res = await apiFetch("/notita", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setNotaError("Could not save note.");
        return;
      }
      setNotaModal(null);
      await loadDosar();
    } catch {
      setNotaError("Network error while saving.");
    } finally {
      setNotaPending(false);
    }
  }

  async function onStergeNota() {
    if (notaModal?.kind !== "view" || notaPending) return;
    const id = notaModal.note.id;
    if (id === null || id === undefined) return;
    if (!window.confirm("Delete this note?")) return;
    setNotaPending(true);
    setNotaError("");
    try {
      const res = await apiFetch("/notita", {
        method: "POST",
        body: JSON.stringify({ actiune: "sterge", id }),
      });
      if (!res.ok) {
        setNotaError("Could not delete note.");
        return;
      }
      setNotaModal(null);
      await loadDosar();
    } catch {
      setNotaError("Network error while deleting.");
    } finally {
      setNotaPending(false);
    }
  }

  const cursant = data?.cursant;
  const misiune = data?.misiune_activa;
  const updateuri = data?.updateuri ?? [];
  const misiuni = data?.misiuni ?? [];
  const notite = data?.notite ?? [];
  const skilluri = data?.skilluri ?? [];
  const ultimulUpdate = cursant?.ultimul_update || updateuri[0]?.data || null;

  const semafor = useMemo(() => {
    if (!cursant) return null;
    return calcSemafor({
      ultimul_update: ultimulUpdate,
      ritm_zile: cursant.ritm_zile,
      misiune_status: misiune?.status ?? cursant.misiune_status,
    });
  }, [cursant, misiune?.status, ultimulUpdate]);

  const bottleneck = useMemo(() => bottleneckSkill(skilluri), [skilluri]);

  const draftEdited = misiuneDraft !== aiText;
  const statusBadge = draftEdited ? "editata" : misiune?.status || null;

  const timeline = useMemo(
    () => buildTimeline(updateuri, misiuni, notite),
    [updateuri, misiuni, notite],
  );

  const filteredTimeline = useMemo(() => {
    if (activitateFilter === "update") {
      return timeline.filter((t) => t.kind === "update");
    }
    if (activitateFilter === "misiuni") {
      return timeline.filter((t) => t.kind === "misiune");
    }
    if (activitateFilter === "notite") {
      return timeline.filter((t) => t.kind === "notita");
    }
    return timeline;
  }, [timeline, activitateFilter]);

  const reminders = useMemo(() => buildReminders(notite), [notite]);

  const showUrmeaza =
    reminders.length > 0 &&
    (activitateFilter === "toate" || activitateFilter === "notite");

  const monthGroups = useMemo(
    () => groupTimelineByMonth(filteredTimeline),
    [filteredTimeline],
  );

  const ritmLabel =
    cursant?.ritm_zile === null ||
    cursant?.ritm_zile === undefined ||
    String(cursant.ritm_zile).trim() === ""
      ? "—"
      : `${cursant.ritm_zile} days`;

  const stareCompact =
    cursant && semafor ? (
      <section className="rounded-[12px] border border-line bg-surface p-3">
        <h2 className="mb-2 text-[11.5px] font-bold tracking-[0.08em] text-accent uppercase">
          Current state
        </h2>
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm leading-snug text-foreground">
          <span
            className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${SEMAFOR_DOT[semafor.culoare]}`}
            aria-hidden
          />
          <span className="font-medium">{SEMAFOR_LABEL[semafor.culoare]}</span>
          <span className="text-foreground/45">·</span>
          <span className="text-foreground/75">{semafor.tooltip}</span>
          <span className="text-foreground/45">·</span>
          <span className="min-w-0 truncate text-foreground/75">
            {bottleneck
              ? `${dash(bottleneck.nume)} ${skillNivelVal(bottleneck)}`
              : "—"}
          </span>
        </p>
      </section>
    ) : null;

  return (
    <main
      data-dosar-page
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground"
    >
      <div className="lab-utility-row flex shrink-0 items-center px-4 sm:px-5">
        <Link
          href="/cursanti"
          className="text-sm text-accent underline-offset-2 hover:underline"
        >
          ← Students
        </Link>
      </div>

      {error ? (
        <p className="shrink-0 px-4 py-3 text-sm text-red-800 sm:px-5" role="alert">
          {error}
        </p>
      ) : null}

      {!data && !error ? (
        <p className="px-4 py-4 text-sm text-foreground/60 sm:px-5">Loading…</p>
      ) : null}

      {cursant ? (
        <div
          className={`flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 sm:p-4 xl:flex-row xl:overflow-hidden`}
        >
          {/* STÂNGA — identitate + despre */}
          <aside
            className={`flex w-full shrink-0 flex-col gap-3 xl:h-full xl:w-[300px] ${COL_SCROLL}`}
          >
            <div className="rounded-[12px] border border-line bg-surface p-4">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent text-xl font-semibold text-[#F4EFE6]"
                  aria-hidden
                >
                  {initiala(cursant.nume)}
                </div>
                <div className="min-w-0">
                  <h1
                    className="truncate text-xl font-semibold leading-snug text-foreground"
                    style={{ fontFamily: "var(--font-fraunces), serif" }}
                  >
                    {dash(cursant.nume)}
                  </h1>
                  <p className="mt-0.5 text-xs tracking-wide text-foreground/55">
                    {dash(cursant.cod)}
                  </p>
                </div>
              </div>

              <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-3 text-sm">
                <div className="flex items-baseline gap-1.5">
                  <dt className="text-xs text-foreground/55">Nivel</dt>
                  <dd className="font-medium text-accent">{dash(cursant.nivel)}</dd>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <dt className="text-xs text-foreground/55">Lector</dt>
                  <dd className="font-medium">{dash(cursant.lector)}</dd>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <dt className="text-xs text-foreground/55">Ritm</dt>
                  <dd className="font-medium">{ritmLabel}</dd>
                </div>
              </dl>

              <div className="mt-3 grid grid-cols-4 gap-1 border-t border-line pt-1">
                <ActionButton
                  icon={IcoUpdate}
                  label="Update"
                  onClick={() =>
                    openUpdate(cod, {
                      onSaved: () => {
                        void loadDosar();
                      },
                    })
                  }
                />
                <ActionButton
                  icon={IcoMisiune}
                  label="Mission"
                  onClick={goMisiune}
                />
                <ActionButton icon={IcoChat} label="Chat" onClick={goChat} />
                <ActionButton
                  icon={IcoEdit}
                  label="Edit"
                  onClick={goEditeaza}
                />
              </div>
            </div>

            <section className="rounded-[12px] border border-line bg-surface">
              <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
                <h2 className="text-[11.5px] font-bold tracking-[0.08em] text-accent uppercase">
                  Initial profile
                </h2>
                <Link
                  href={`/profil?cod=${encodeURIComponent(cod)}`}
                  className="text-xs font-medium text-accent underline-offset-2 hover:underline"
                >
                  Edit
                </Link>
              </div>
              <dl className="divide-y divide-line/70 text-sm">
                {(
                  [
                    ["Start", cursant.data_start],
                    ["Context", cursant.context],
                    ["Obiectiv", cursant.obiectiv],
                    ["Puncte tari", cursant.puncte_tari],
                    ["Focus", cursant.focus_start],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="px-4 py-2.5">
                    <dt className="text-xs tracking-wide text-foreground/55 uppercase">
                      {label}
                    </dt>
                    <dd className="mt-1 whitespace-pre-wrap leading-relaxed text-foreground/90">
                      {dash(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          </aside>

          {/* MIJLOC — taburi + conținut */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden xl:h-full">
            <nav
              className="z-10 grid shrink-0 grid-cols-3 gap-1 bg-background"
              aria-label="Dossier sections"
            >
              {(
                [
                  ["prezent", "Present"],
                  ["activitate", "Activity"],
                  ["misiune", "Mission"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={
                    tab === key
                      ? "rounded-[12px] border border-line bg-surface px-3 py-3 text-sm font-semibold text-foreground"
                      : "rounded-[12px] px-3 py-3 text-sm text-foreground/60 hover:bg-surface/60 hover:text-foreground"
                  }
                >
                  {label}
                </button>
              ))}
            </nav>

            <div className={`mt-3 min-h-0 flex-1 ${COL_SCROLL}`}>
              {tab === "prezent" ? (
                <div className="flex flex-col gap-3 pb-1">
                  <section className="rounded-[12px] border border-line bg-surface p-4 sm:p-5">
                    <p className="text-sm text-foreground/80">
                      Ritm: {ritmLabel}
                      <span className="text-foreground/45"> · </span>
                      ultimul update:{" "}
                      <span className="tabular-nums">{dash(ultimulUpdate)}</span>
                    </p>
                    <p className="mt-2 text-sm text-foreground/80">
                      Lacune: {dash(cursant.lacune)}
                    </p>
                  </section>

                  <section className="rounded-[12px] border border-line bg-surface p-4 sm:p-5">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <h2 className="text-[11.5px] font-bold tracking-[0.08em] text-accent uppercase">
                        Active mission
                      </h2>
                      {misiune ? <TabBadge tip={misiune.status} /> : null}
                    </div>
                    {misiune ? (
                      <MisiuneMarkdown text={misiune.textul || ""} />
                    ) : (
                      <p className="text-sm text-foreground/55">
                        No active mission.
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => setTab("misiune")}
                      className="mt-3 text-xs font-medium text-accent underline-offset-2 hover:underline"
                    >
                      See Mission tab →
                    </button>
                  </section>
                </div>
              ) : null}

              {tab === "activitate" ? (
                <section className="rounded-[12px] bg-background p-3 sm:p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div
                      className="flex flex-wrap gap-1.5"
                      role="group"
                      aria-label="Filtru"
                    >
                      {(
                        [
                          ["toate", "All"],
                          ["update", "Update"],
                          ["misiuni", "Missions"],
                          ["notite", "Notes"],
                        ] as const
                      ).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setActivitateFilter(key)}
                          className={
                            activitateFilter === key
                              ? "rounded border border-accent bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent"
                              : "rounded border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-foreground/65 hover:text-foreground"
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={openNotaNew}
                      className="rounded border border-accent bg-accent px-2.5 py-1 text-[11px] font-semibold text-[#F4EFE6] transition hover:brightness-110"
                    >
                      + Notă
                    </button>
                  </div>

                  {showUrmeaza ? (
                    <div className="mb-4">
                      <h3 className="mb-2 text-[11.5px] font-bold tracking-[0.08em] text-accent uppercase">
                        Upcoming
                      </h3>
                      <ul className="flex flex-col gap-2">
                        {reminders.map((r, i) => (
                          <li key={`rem-${r.note.id ?? i}`}>
                            <button
                              type="button"
                              onClick={() => openNotaView(r.note)}
                              className={`w-full rounded-[12px] border border-line bg-surface px-3.5 py-3 text-left transition hover:bg-white ${
                                r.overdue ? "ring-1 ring-red-700/35" : ""
                              }`}
                            >
                              <p
                                className={`text-[11px] font-semibold tracking-wide uppercase ${
                                  r.overdue
                                    ? "text-red-700"
                                    : "text-foreground/55"
                                }`}
                              >
                                Reminder · {formatDayShort(r.remDay)}
                              </p>
                              <p
                                className={`mt-1 line-clamp-2 text-sm leading-snug ${
                                  r.overdue
                                    ? "text-red-800"
                                    : "text-foreground/90"
                                }`}
                              >
                                {dash(r.note.textul)}
                              </p>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {monthGroups.length === 0 ? (
                    <p className="py-4 text-sm text-foreground/55">
                      {activitateFilter === "notite"
                        ? "No notes."
                        : "No events."}
                    </p>
                  ) : (
                    <div className="flex flex-col gap-5">
                      {monthGroups.map(([key, events]) => (
                        <div key={key}>
                          <h3 className="mb-2 text-[11.5px] font-bold tracking-[0.08em] text-accent uppercase">
                            {monthHeading(key)}
                          </h3>
                          <ul className="flex flex-col gap-2">
                            {events.map((ev) => {
                              const when = formatEventWhen(ev.whenRaw);
                              const cardClass = `flex w-full items-start gap-3 rounded-[12px] border border-line bg-surface px-3.5 py-3 text-left transition hover:bg-white ${
                                ev.dimmed ? "opacity-70" : ""
                              }`;
                              const inner = (
                                <>
                                  <span className="mt-0.5">
                                    <TimelineGlyph kind={ev.kind} />
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-semibold text-foreground">
                                      {ev.title}
                                    </span>
                                    <span className="mt-0.5 line-clamp-2 block text-sm leading-snug text-foreground/75">
                                      {ev.body}
                                    </span>
                                  </span>
                                  <time className="shrink-0 pt-0.5 text-[11px] tabular-nums text-foreground/50">
                                    {when}
                                  </time>
                                </>
                              );

                              if (ev.kind === "notita" && ev.note) {
                                return (
                                  <li key={ev.key}>
                                    <button
                                      type="button"
                                      onClick={() => openNotaView(ev.note!)}
                                      className={cardClass}
                                    >
                                      {inner}
                                    </button>
                                  </li>
                                );
                              }

                              if (ev.kind === "misiune") {
                                return (
                                  <li key={ev.key}>
                                    <button
                                      type="button"
                                      onClick={() => setTab("misiune")}
                                      className={cardClass}
                                    >
                                      {inner}
                                    </button>
                                  </li>
                                );
                              }

                              return (
                                <li key={ev.key} className={cardClass}>
                                  {inner}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              ) : null}

              {tab === "misiune" ? (
                <section className="rounded-[12px] border border-line bg-surface p-4 sm:p-5">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <h2 className="text-[11.5px] font-bold tracking-[0.08em] text-accent uppercase">
                      Active mission
                    </h2>
                    {statusBadge ? <TabBadge tip={statusBadge} /> : null}
                  </div>

                  <MisiuneEditor
                    ref={misiuneEditorRef}
                    value={misiuneDraft}
                    onChange={setMisiuneDraft}
                    placeholder="Write or generate the mission…"
                  />

                  <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                    <button
                      type="button"
                      disabled={pending || !cod}
                      onClick={() =>
                        onMisiuneActiune("aproba", {
                          textul: readMisiuneEditorText(),
                        })
                      }
                      className="rounded-md bg-accent px-3.5 py-2 text-sm font-semibold text-[#F4EFE6] transition hover:brightness-110 disabled:opacity-60"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={pending || !cod}
                      onClick={() =>
                        onMisiuneActiune("ciorna", {
                          textul: readMisiuneEditorText(),
                        })
                      }
                      className="rounded-md border border-line bg-background px-3.5 py-2 text-sm font-medium text-foreground transition hover:bg-surface disabled:opacity-60"
                    >
                      Save draft
                    </button>
                    <button
                      type="button"
                      disabled={pending || !cod}
                      onClick={onScrieTu}
                      className="rounded-md border border-line bg-background px-3.5 py-2 text-sm font-medium text-foreground transition hover:bg-surface disabled:opacity-60"
                    >
                      Write yourself
                    </button>
                    <button
                      type="button"
                      disabled={pending || !cod}
                      onClick={() => onMisiuneActiune("skip")}
                      className="rounded-md border border-line bg-background px-3.5 py-2 text-sm font-medium text-foreground transition hover:bg-surface disabled:opacity-60"
                    >
                      Skip
                    </button>
                    <button
                      type="button"
                      disabled={pending || !cod}
                      onClick={onRegenereaza}
                      className="rounded-md border border-line bg-background px-3.5 py-2 text-sm font-medium text-foreground transition hover:bg-surface disabled:opacity-60"
                    >
                      Regenerate
                    </button>
                  </div>

                  {actionError ? (
                    <p className="mt-3 text-sm text-red-800" role="alert">
                      {actionError}
                    </p>
                  ) : null}
                  {pending ? (
                    <p className="mt-2 text-xs text-foreground/55">
                      Processing…
                    </p>
                  ) : null}
                </section>
              ) : null}
            </div>
          </div>

          {/* DREAPTA — skilluri + stare compactă */}
          <aside
            className={`flex w-full shrink-0 flex-col gap-3 xl:h-full xl:w-[280px] ${COL_SCROLL}`}
          >
            <section className="rounded-[12px] border border-line bg-surface">
              <h2 className="border-b border-line px-4 py-2.5 text-[11.5px] font-bold tracking-[0.08em] text-accent uppercase">
                Training
              </h2>
              <ul className="divide-y divide-line/70">
                {skilluri.length === 0 ? (
                  <li className="px-4 py-3 text-sm text-foreground/55">
                    No skills.
                  </li>
                ) : (
                  skilluri.map((s: SkillRow, i) => {
                    const skillId = Number(s.skill_id);
                    const nivelNum = Number(s.nivel);
                    const current =
                      s.nivel === null ||
                      s.nivel === undefined ||
                      Number.isNaN(nivelNum)
                        ? 0
                        : nivelNum;
                    return (
                      <li
                        key={`${s.skill_id ?? s.nume ?? "skill"}-${i}`}
                        className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                      >
                        <span className="min-w-0 truncate">{dash(s.nume)}</span>
                        <div
                          className="flex shrink-0 gap-2"
                          role="group"
                          aria-label={dash(s.nume)}
                        >
                          {[1, 2, 3, 4, 5].map((n) => {
                            const filled = current >= n;
                            return (
                              <button
                                key={n}
                                type="button"
                                disabled={pending || !cod || !skillId}
                                title={`Nivel ${n}`}
                                aria-label={`Nivel ${n}`}
                                aria-pressed={filled}
                                onClick={() => onSkillNivel(skillId, n)}
                                className={
                                  filled
                                    ? "h-4 w-4 rounded-full border border-accent bg-accent transition hover:brightness-110 disabled:opacity-60"
                                    : "h-4 w-4 rounded-full border border-[#ddd] bg-[#ddd] transition hover:border-accent hover:bg-accent/40 disabled:opacity-60"
                                }
                              />
                            );
                          })}
                        </div>
                      </li>
                    );
                  })
                )}
              </ul>
              {actionError && tab !== "misiune" ? (
                <p
                  className="border-t border-line px-4 py-2 text-sm text-red-800"
                  role="alert"
                >
                  {actionError}
                </p>
              ) : null}
            </section>

            {stareCompact}
          </aside>
        </div>
      ) : null}

      {notaModal ? (
        <NotitaModal
          mode={notaModal}
          pending={notaPending}
          error={notaError}
          onClose={closeNotaModal}
          onSave={(payload) => void onSalveazaNota(payload)}
          onDelete={
            notaModal.kind === "view"
              ? () => void onStergeNota()
              : undefined
          }
        />
      ) : null}
    </main>
  );
}

export default function DosarPage() {
  return (
    <Suspense
      fallback={
        <main
          data-dosar-page
          className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground"
        >
          <p className="px-4 py-4 text-sm text-foreground/60 sm:px-5">
            Loading…
          </p>
        </main>
      }
    >
      <DosarPageInner />
    </Suspense>
  );
}
