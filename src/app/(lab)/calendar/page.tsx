"use client";

import Link from "next/link";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  BookingSlotCalendar,
  parseBookingSlot,
} from "@/components/BookingSlotCalendar";
import {
  apiFetch,
  type Cursant,
  type Lector,
  type Me,
  type Sesiune,
  type SesiuneStatus,
} from "@/lib/api";
import { goStudent } from "@/lib/student-paths";

const HOUR_START = 8;
const HOUR_END = 20;
/** Hours rendered in the grid body (08→20). */
const GRID_HOURS = HOUR_END - HOUR_START; // 12
/** Min px per hour so a 60min event reads as a real block. */
const HOUR_PX_MIN = 48;
/** Fixed hour-label gutter width (matches header spacer). */
const GUTTER_W = 48;
/** Space above the first hour line so the label isn’t clipped. */
const GUTTER_PAD_TOP = 10;
const DAY_HEADER_H = 52;
const HOUR_LINE = "#E8E0D4";
const HALF_LINE = "#EDE7DC";
const GRID_BG = "#FFFcf7";
const TODAY_WASH = "#F3F6F0";
const WEEKEND_WASH = "#F6F4F0";
const NOW_COLOR = "#D4A017";
const SESSION_FILL = "#C5D9CC";
const SESSION_FILL_HOVER = "#B5CCBD";
const SESSION_EDGE = "#2C5F45";
const HOUR_LABEL = "#8A8478";
const EVENT_TITLE = "#1C2B22";
const EVENT_TIME = "#4A5C52";
/** Overlap cascade: each next event is this many px inset from the right. */
const OVERLAP_INSET = 8;

function gridYFromMins(minsFromStart: number, hourPx: number): number {
  return GUTTER_PAD_TOP + (minsFromStart / 60) * hourPx;
}

const STATUS_OPTS: { value: SesiuneStatus; label: string }[] = [
  { value: "programat", label: "Scheduled" },
  { value: "done", label: "Done" },
  { value: "no_show", label: "No-show" },
  { value: "anulat", label: "Cancel" },
];

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Half-hour slots from 08:00 through 20:00 (inclusive). */
function timeOptions30(): string[] {
  const opts: string[] = [];
  for (let mins = HOUR_START * 60; mins <= HOUR_END * 60; mins += 30) {
    opts.push(`${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`);
  }
  return opts;
}

const TIME_OPTIONS_30 = timeOptions30();

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToTimeStr(mins: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, mins));
  return `${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}`;
}

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay(); // 0 Sun … 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

const TZ_BUCHAREST = "Europe/Bucharest";

function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Wall-clock parts in Europe/Bucharest (same role as Flask `_now_bucharest`). */
function nowBucharest(d: Date = new Date()): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  ymd: string;
} {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ_BUCHAREST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const bag: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) {
    if (p.type !== "literal") bag[p.type] = p.value;
  }
  const year = Number(bag.year);
  const month = Number(bag.month);
  const day = Number(bag.day);
  return {
    year,
    month,
    day,
    hour: Number(bag.hour),
    minute: Number(bag.minute),
    second: Number(bag.second),
    ymd: `${year}-${pad2(month)}-${pad2(day)}`,
  };
}

/**
 * Local calendar date (Europe/Bucharest) for a `starts_at` string
 * (same role as Flask `_fmt_local_dt` date part).
 * Naive ISO = already Bucharest wall clock; offset/Z → convert to Bucharest.
 */
function fmtLocalDtYmd(iso: string): string | null {
  const s = (iso || "").trim();
  if (!s) return null;
  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(.*)$/,
  );
  if (!m) return null;
  const suffix = (m[7] || "").trim();
  if (suffix === "Z" || /^[+-]\d{2}/.test(suffix)) {
    const instant = new Date(s);
    if (Number.isNaN(instant.getTime())) return null;
    return nowBucharest(instant).ymd;
  }
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * Quiet agenda line: sessions on `targetYmd` (Bucharest local date).
 * Day view → header day; Week view → Bucharest today.
 */
function filterRailDay(sessions: Sesiune[], targetYmd: string): Sesiune[] {
  return sessions
    .filter((s) => (s.status || "").toLowerCase() !== "anulat")
    .filter((s) => fmtLocalDtYmd(s.starts_at) === targetYmd)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

function parseLocal(iso: string): Date | null {
  const s = (iso || "").trim();
  if (!s) return null;
  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/,
  );
  if (m) {
    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6] || 0),
    );
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toLocalIso(d: Date): string {
  return `${ymd(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:00`;
}

function fmtTime(iso: string): string {
  const d = parseLocal(iso);
  if (!d) return "—";
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function firstName(nume?: string | null): string {
  const t = (nume || "").trim();
  if (!t) return "";
  return t.split(/\s+/)[0] || "";
}

function studentLabel(s: Sesiune): string {
  const cod = (s.cursant_cod || "").trim();
  const fn = firstName(s.cursant_nume);
  if (cod && fn) return `${cod} ${fn}`;
  return cod || fn || "";
}

/** Main event title: trimmed titlu if set, else student / Block. */
function chipPrimary(s: Sesiune): string {
  const titlu = (s.titlu || "").trim();
  if (titlu) return titlu;
  if (s.tip === "personal") return "Block";
  return studentLabel(s) || "Session";
}

function minutesFromGridStart(d: Date): number {
  return d.getHours() * 60 + d.getMinutes() - HOUR_START * 60;
}

/** Pack overlapping events; later columns cascade 8px inset from the right. */
function layoutOverlaps(
  items: { sesiune: Sesiune; topMin: number; endMin: number }[],
  hourPx: number,
): {
  sesiune: Sesiune;
  top: number;
  height: number;
  col: number;
}[] {
  const sorted = [...items].sort(
    (a, b) => a.topMin - b.topMin || b.endMin - a.endMin,
  );
  const colEnd: number[] = [];
  const placed = sorted.map((ev) => {
    let col = 0;
    while (col < colEnd.length && colEnd[col] > ev.topMin) col += 1;
    if (col === colEnd.length) colEnd.push(ev.endMin);
    else colEnd[col] = ev.endMin;
    return { ...ev, col };
  });
  const minH = Math.max(22, hourPx / 2 - 1);
  return placed.map((ev) => {
    const top = gridYFromMins(ev.topMin, hourPx);
    const height = Math.max(
      minH,
      ((ev.endMin - ev.topMin) / 60) * hourPx,
    );
    return {
      sesiune: ev.sesiune,
      top,
      height,
      col: ev.col,
    };
  });
}

function weekLabel(mon: Date): string {
  const sun = addDays(mon, 6);
  const sameMonth = mon.getMonth() === sun.getMonth();
  if (sameMonth) {
    const month = sun.toLocaleDateString("en-GB", { month: "short" });
    return `${mon.getDate()}–${sun.getDate()} ${month}`;
  }
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${mon.toLocaleDateString("en-GB", opts)} – ${sun.toLocaleDateString("en-GB", opts)}`;
}

function dayHeaderLabel(d: Date): string {
  return d.toLocaleDateString("en-GB", { weekday: "short" });
}

function focusDayLabel(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function isLunchTitle(s: Sesiune): boolean {
  return (s.titlu || "").toLowerCase().includes("lunch");
}

function isMultiDay(s: Sesiune): boolean {
  const a = parseLocal(s.starts_at);
  const b = parseLocal(s.ends_at);
  if (!a || !b) return false;
  return ymd(a) !== ymd(b);
}

type ViewMode = "day" | "week";

export default function CalendarPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [weekMon, setWeekMon] = useState(() => startOfWeekMonday(new Date()));
  const [focusDay, setFocusDay] = useState(() => new Date());
  const [rows, setRows] = useState<Sesiune[] | null>(null);
  const [railRows, setRailRows] = useState<Sesiune[]>([]);
  const [cursanti, setCursanti] = useState<Cursant[]>([]);
  const [lectori, setLectori] = useState<Lector[]>([]);
  const [lectorFilter, setLectorFilter] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Sesiune | null>(null);
  const [editStatus, setEditStatus] = useState<SesiuneStatus>("programat");
  const [editNota, setEditNota] = useState("");
  const [editTitlu, setEditTitlu] = useState("");
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addTab, setAddTab] = useState<"session" | "personal">("session");
  const [addPresetDate, setAddPresetDate] = useState<string | null>(null);
  const [addPresetTime, setAddPresetTime] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [hourPx, setHourPx] = useState(HOUR_PX_MIN);
  const gridScrollRef = useRef<HTMLDivElement>(null);

  const weekDays = useMemo(
    () => [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(weekMon, i)),
    [weekMon],
  );
  const gridDays = viewMode === "week" ? weekDays : [focusDay];
  const rangeFrom =
    viewMode === "week"
      ? `${ymd(weekMon)}T00:00:00`
      : `${ymd(focusDay)}T00:00:00`;
  /** Week: Mon 00:00 → next Mon 00:00 (includes Sun). */
  const rangeTo =
    viewMode === "week"
      ? `${ymd(addDays(weekMon, 7))}T00:00:00`
      : `${ymd(addDays(focusDay, 1))}T00:00:00`;
  const bucharest = useMemo(() => nowBucharest(now), [now]);
  const todayYmd = bucharest.ymd;
  const currentWeekMon = useMemo(
    () =>
      startOfWeekMonday(
        new Date(bucharest.year, bucharest.month - 1, bucharest.day),
      ),
    [bucharest.year, bucharest.month, bucharest.day],
  );
  const isViewingCurrentWeek =
    viewMode === "week"
      ? ymd(weekMon) === ymd(currentWeekMon)
      : ymd(focusDay) === todayYmd;
  /** Day → calendar header date; Week → Bucharest today. */
  const railTargetYmd = viewMode === "day" ? ymd(focusDay) : todayYmd;

  const isAdmin = me?.role === "admin";

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  async function loadSesiuni() {
    const q = new URLSearchParams({ from: rangeFrom, to: rangeTo });
    if (isAdmin && lectorFilter) q.set("lector", lectorFilter);
    const res = await apiFetch(`/sesiuni?${q.toString()}`);
    if (res.status === 401) {
      router.replace("/login");
      return false;
    }
    if (res.status === 403) {
      setError("Access denied.");
      setRows([]);
      return false;
    }
    if (!res.ok) {
      setError("Could not load calendar.");
      setRows([]);
      return false;
    }
    const data = (await res.json()) as Sesiune[];
    setRows(Array.isArray(data) ? data : []);
    setError("");
    return true;
  }

  async function loadRail() {
    const mon = startOfWeekMonday(new Date());
    // This week = Mon 00:00 → Sun inclusive (to = next Mon 00:00)
    const from = `${ymd(mon)}T00:00:00`;
    const to = `${ymd(addDays(mon, 7))}T00:00:00`;
    const q = new URLSearchParams({ from, to });
    if (isAdmin && lectorFilter) q.set("lector", lectorFilter);
    const res = await apiFetch(`/sesiuni?${q.toString()}`);
    if (res.status === 401) {
      router.replace("/login");
      return;
    }
    if (!res.ok) {
      setRailRows([]);
      return;
    }
    const data = (await res.json()) as Sesiune[];
    setRailRows(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const meRes = await apiFetch("/me");
        if (meRes.status === 401) {
          router.replace("/login");
          return;
        }
        if (!meRes.ok) {
          if (!cancelled) setError("Could not load calendar.");
          return;
        }
        const meData = (await meRes.json()) as Me;
        if (cancelled) return;
        if (meData.role === "cursant") {
          goStudent("home", router);
          return;
        }
        setMe(meData);

        const cursRes = await apiFetch("/cursanti");
        if (cursRes.ok) {
          const list = (await cursRes.json()) as Cursant[];
          if (!cancelled) setCursanti(Array.isArray(list) ? list : []);
        }

        if (meData.role === "admin") {
          const lectRes = await apiFetch("/lectori");
          if (lectRes.ok) {
            const list = (await lectRes.json()) as Lector[];
            if (!cancelled) setLectori(Array.isArray(list) ? list : []);
          }
        }
      } catch {
        if (!cancelled) setError("Could not load calendar.");
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!me) return;
    void loadSesiuni();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on range/filter/me
  }, [me, rangeFrom, rangeTo, lectorFilter]);

  useEffect(() => {
    if (!me) return;
    void loadRail();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rail: current week + filter
  }, [me, lectorFilter]);

  const todayList = useMemo(() => {
    const source = viewMode === "day" ? rows || [] : railRows;
    return filterRailDay(source, railTargetYmd);
  }, [viewMode, rows, railRows, railTargetYmd]);

  const noShowCount = useMemo(() => {
    const mon = ymd(currentWeekMon);
    const nextMon = ymd(addDays(currentWeekMon, 7));
    return railRows.filter((s) => {
      if (s.status !== "no_show") return false;
      const key = fmtLocalDtYmd(s.starts_at);
      return !!key && key >= mon && key < nextMon;
    }).length;
  }, [railRows, currentWeekMon]);

  const byDay = useMemo(() => {
    const map: Record<string, Sesiune[]> = {};
    for (const d of gridDays) map[ymd(d)] = [];
    for (const s of rows || []) {
      if (isLunchTitle(s) && isMultiDay(s) && viewMode === "week") continue;
      const start = parseLocal(s.starts_at);
      const end = parseLocal(s.ends_at);
      if (!start || !end) continue;
      // Place on each visible day the event overlaps (single-day usual case)
      for (const d of gridDays) {
        const key = ymd(d);
        const dayStart = new Date(
          d.getFullYear(),
          d.getMonth(),
          d.getDate(),
          0,
          0,
          0,
        );
        const dayEnd = addDays(dayStart, 1);
        if (start < dayEnd && end > dayStart) {
          map[key].push(s);
        }
      }
    }
    return map;
  }, [rows, gridDays, viewMode]);

  const multiDayLunch = useMemo(() => {
    if (viewMode !== "week") return [];
    return (rows || []).filter((s) => isLunchTitle(s) && isMultiDay(s));
  }, [rows, viewMode]);

  function openEdit(s: Sesiune) {
    setSelected(s);
    setEditStatus(s.status || "programat");
    setEditNota(s.nota || "");
    setEditTitlu(s.titlu || "");
    setSaveError("");
  }

  function openAdd(day?: Date, hour?: number) {
    if (day) setAddPresetDate(ymd(day));
    else setAddPresetDate(null);
    if (hour != null) setAddPresetTime(`${pad2(hour)}:00`);
    else setAddPresetTime(null);
    setAddTab("session");
    setAddOpen(true);
  }

  function goToday() {
    const t = new Date();
    setWeekMon(startOfWeekMonday(t));
    setFocusDay(t);
  }

  function goPrev() {
    if (viewMode === "week") setWeekMon((m) => addDays(m, -7));
    else {
      setFocusDay((d) => {
        const next = addDays(d, -1);
        setWeekMon(startOfWeekMonday(next));
        return next;
      });
    }
  }

  function goNext() {
    if (viewMode === "week") setWeekMon((m) => addDays(m, 7));
    else {
      setFocusDay((d) => {
        const next = addDays(d, 1);
        setWeekMon(startOfWeekMonday(next));
        return next;
      });
    }
  }

  function setMode(mode: ViewMode) {
    setViewMode(mode);
    if (mode === "day") {
      const inWeek = weekDays.some((d) => ymd(d) === todayYmd);
      setFocusDay(inWeek ? new Date() : weekMon);
    } else {
      setWeekMon(startOfWeekMonday(focusDay));
    }
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!selected || savePending) return;
    setSavePending(true);
    setSaveError("");
    try {
      const body: Record<string, string> = {
        status: editStatus,
        nota: editNota,
        titlu: editTitlu.trim(),
      };
      if (selected.tip === "personal" && !body.titlu) {
        setSaveError("Title is required.");
        setSavePending(false);
        return;
      }
      const res = await apiFetch(`/sesiuni/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        setSaveError("Could not save.");
        return;
      }
      const json = (await res.json()) as { sesiune?: Sesiune };
      if (json.sesiune) {
        const updated = {
          ...json.sesiune,
          titlu: (json.sesiune.titlu || "").trim(),
        };
        setRows((prev) =>
          (prev || []).map((r) => (r.id === updated.id ? updated : r)),
        );
        setRailRows((prev) =>
          prev.map((r) => (r.id === updated.id ? updated : r)),
        );
        setSelected(updated);
        setEditTitlu(updated.titlu || "");
      } else {
        await loadSesiuni();
        await loadRail();
      }
    } catch {
      setSaveError("Could not save.");
    } finally {
      setSavePending(false);
    }
  }

  async function onDelete() {
    if (!selected || savePending) return;
    if (!window.confirm("Delete this entry?")) return;
    setSavePending(true);
    setSaveError("");
    try {
      const res = await apiFetch(`/sesiuni/${selected.id}`, { method: "DELETE" });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        setSaveError("Could not delete.");
        return;
      }
      setSelected(null);
      await loadSesiuni();
      await loadRail();
    } catch {
      setSaveError("Could not delete.");
    } finally {
      setSavePending(false);
    }
  }

  const nowTopPx = useMemo(() => {
    const mins =
      bucharest.hour * 60 + bucharest.minute - HOUR_START * 60;
    if (mins < 0 || mins > GRID_HOURS * 60) return null;
    return gridYFromMins(mins, hourPx);
  }, [bucharest.hour, bucharest.minute, hourPx]);
  const nowTimeLabel = `${pad2(bucharest.hour)}:${pad2(bucharest.minute)}`;
  const gridContentPx = GUTTER_PAD_TOP + GRID_HOURS * hourPx;

  // Hour height: at least 48px; grow to fill viewport when possible
  useEffect(() => {
    const el = gridScrollRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.clientHeight;
      if (h > 0) setHourPx(Math.max(HOUR_PX_MIN, h / GRID_HOURS));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [me]);

  // On load / navigate: 08:00 at top, or (now − 1h) if now in range
  useEffect(() => {
    const el = gridScrollRef.current;
    if (!el || hourPx <= 0) return;
    const nowMins = bucharest.hour * 60 + bucharest.minute;
    const rangeStart = HOUR_START * 60;
    const rangeEnd = HOUR_END * 60;
    let scrollMins: number;
    if (nowMins >= rangeStart && nowMins <= rangeEnd) {
      scrollMins = Math.max(rangeStart, nowMins - 60) - rangeStart;
    } else {
      scrollMins = 0;
    }
    const id = requestAnimationFrame(() => {
      el.scrollTop = gridYFromMins(scrollMins, hourPx);
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- not every minute
  }, [weekMon, viewMode, focusDay, me, hourPx]);

  const colCount = gridDays.length;
  const railHeadingDate =
    viewMode === "day"
      ? focusDay
      : new Date(bucharest.year, bucharest.month - 1, bucharest.day);
  const railIsToday = ymd(railHeadingDate) === todayYmd;
  const sessionCount = todayList.length;
  const quietSummary = (() => {
    const dayWord = railIsToday
      ? "today"
      : railHeadingDate.toLocaleDateString("en-GB", {
          weekday: "short",
          day: "numeric",
        });
    const sessions =
      sessionCount === 0
        ? `No sessions ${dayWord}`
        : `${sessionCount} session${sessionCount === 1 ? "" : "s"} ${dayWord}`;
    return `${sessions} · ${noShowCount} no-show${noShowCount === 1 ? "" : "s"} this week`;
  })();

  return (
    <div
      data-calendar-page
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden text-foreground"
      style={{
        background: GRID_BG,
        fontFamily: "var(--font-figtree), system-ui, sans-serif",
      }}
    >
      {/* Compact chrome: Today | ‹ › | range · Day/Week · lecturer · +Add */}
      <header className="lab-utility-row flex shrink-0 items-center gap-1.5 px-4">
        <button
          type="button"
          onClick={goToday}
          className="rounded-md border border-[#E8E0D4] bg-white px-2.5 py-1 text-xs font-medium text-foreground/70 transition hover:border-[#2C5F45]/40 hover:text-[#2C5F45]"
        >
          Today
        </button>
        <button
          type="button"
          aria-label={viewMode === "week" ? "Previous week" : "Previous day"}
          onClick={goPrev}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-foreground/55 transition hover:bg-black/[0.03] hover:text-[#2C5F45]"
        >
          ‹
        </button>
        <button
          type="button"
          aria-label={viewMode === "week" ? "Next week" : "Next day"}
          onClick={goNext}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-foreground/55 transition hover:bg-black/[0.03] hover:text-[#2C5F45]"
        >
          ›
        </button>
        <span className="ml-1 text-[16px] font-medium leading-none tracking-tight text-[#1A1A1A]">
          {viewMode === "week"
            ? weekLabel(weekMon)
            : focusDayLabel(focusDay)}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-md border border-[#E8E0D4] bg-white p-0.5">
            <button
              type="button"
              onClick={() => setMode("day")}
              className={
                viewMode === "day"
                  ? "rounded px-2.5 py-1 text-xs font-medium bg-[#2C5F45] text-white"
                  : "rounded px-2.5 py-1 text-xs text-foreground/55 hover:text-foreground/80"
              }
            >
              Day
            </button>
            <button
              type="button"
              onClick={() => setMode("week")}
              className={
                viewMode === "week"
                  ? "rounded px-2.5 py-1 text-xs font-medium bg-[#2C5F45] text-white"
                  : "rounded px-2.5 py-1 text-xs text-foreground/55 hover:text-foreground/80"
              }
            >
              Week
            </button>
          </div>

          {isAdmin ? (
            <select
              value={lectorFilter}
              onChange={(e) => setLectorFilter(e.target.value)}
              className="rounded-md border border-[#E8E0D4] bg-white px-2 py-1.5 text-xs text-foreground outline-none ring-[#D4A017]/40 focus:ring-2"
              aria-label="Filter by lecturer"
            >
              <option value="">All lecturers</option>
              {lectori.map((l) => (
                <option key={l.username} value={l.username}>
                  {l.name || l.username}
                </option>
              ))}
            </select>
          ) : null}

          <button
            type="button"
            onClick={() => openAdd()}
            className="inline-flex h-8 shrink-0 items-center rounded-md bg-[#2C5F45] px-2.5 text-xs font-medium text-white transition hover:bg-[#245239]"
          >
            + Add
          </button>
        </div>
      </header>

      {/* Quiet one-line summary — not a second toolbar */}
      <p className="shrink-0 px-4 pb-2 pt-0 text-[12px] leading-none text-[#8A8478]">
        {quietSummary}
      </p>

      {/* Grid + optional edit panel */}
      <div className="flex min-h-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {error ? (
          <p className="px-4 py-3 text-sm text-red-800" role="alert">
            {error}
          </p>
        ) : null}

        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col"
          style={{ background: GRID_BG }}
        >
          {/* Sticky weekday header — same column widths as grid (48px gutter + days) */}
          <div
            className="sticky top-0 z-20 grid shrink-0 border-b"
            style={{
              height: DAY_HEADER_H,
              background: GRID_BG,
              borderColor: HOUR_LINE,
              gridTemplateColumns: `${GUTTER_W}px repeat(${colCount}, minmax(0, 1fr))`,
            }}
          >
            <div aria-hidden />
            {gridDays.map((d) => {
              const key = ymd(d);
              const isToday = key === todayYmd;
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              return (
                <div
                  key={key}
                  className="flex h-full flex-col items-center justify-center"
                  style={{
                    background: isToday
                      ? TODAY_WASH
                      : isWeekend
                        ? WEEKEND_WASH
                        : undefined,
                  }}
                >
                  <span
                    className="text-[11px] font-medium uppercase leading-none"
                    style={{
                      color: HOUR_LABEL,
                      letterSpacing: "0.06em",
                    }}
                  >
                    {dayHeaderLabel(d)}
                  </span>
                  {isToday ? (
                    <span
                      className="mt-1 inline-flex items-center justify-center rounded-full text-[15px] font-semibold leading-none text-white"
                      style={{
                        width: 24,
                        height: 24,
                        background: SESSION_EDGE,
                      }}
                    >
                      {d.getDate()}
                    </span>
                  ) : (
                    <span className="mt-1 text-[15px] font-semibold leading-none text-[#1A1A1A]">
                      {d.getDate()}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Hour grid — sole scroll container */}
          <div
            ref={gridScrollRef}
            className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
          >
            <div
              className="relative grid"
              style={{
                gridTemplateColumns: `${GUTTER_W}px repeat(${colCount}, minmax(0, 1fr))`,
                height: gridContentPx,
                minHeight: gridContentPx,
                flexShrink: 0,
              }}
            >
              {/* Time gutter */}
              <div className="relative" style={{ height: gridContentPx }}>
                {Array.from({ length: GRID_HOURS + 1 }, (_, i) => {
                  const top = gridYFromMins(i * 60, hourPx);
                  const hideNearNow =
                    nowTopPx != null &&
                    isViewingCurrentWeek &&
                    Math.abs(top - nowTopPx) < hourPx * 0.28;
                  if (hideNearNow) return null;
                  return (
                    <div
                      key={i}
                      className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums"
                      style={{ top, color: HOUR_LABEL }}
                    >
                      {pad2(HOUR_START + i)}
                    </div>
                  );
                })}
                {isViewingCurrentWeek && nowTopPx != null ? (
                  <div
                    className="pointer-events-none absolute right-0 z-20 flex -translate-y-1/2 items-center"
                    style={{ top: nowTopPx }}
                    aria-hidden
                  >
                    <span
                      className="mr-1 text-[11px] font-medium tabular-nums"
                      style={{ color: NOW_COLOR }}
                    >
                      {nowTimeLabel}
                    </span>
                    <div
                      className="h-2 w-2 shrink-0 translate-x-1/2 rounded-full"
                      style={{ background: NOW_COLOR }}
                    />
                  </div>
                ) : null}
              </div>

              {/* Day columns */}
              {gridDays.map((d) => {
                const key = ymd(d);
                const isToday = key === todayYmd;
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                const dayEvents = byDay[key] || [];
                const laidOut = layoutOverlaps(
                  dayEvents
                    .map((s) => {
                      const start = parseLocal(s.starts_at);
                      const end = parseLocal(s.ends_at);
                      if (!start || !end) return null;
                      const dayStart = new Date(
                        d.getFullYear(),
                        d.getMonth(),
                        d.getDate(),
                        HOUR_START,
                        0,
                        0,
                      );
                      const dayGridEnd = new Date(
                        d.getFullYear(),
                        d.getMonth(),
                        d.getDate(),
                        HOUR_END,
                        0,
                        0,
                      );
                      const clipStart = start < dayStart ? dayStart : start;
                      const clipEnd = end > dayGridEnd ? dayGridEnd : end;
                      let topMin = minutesFromGridStart(clipStart);
                      let endMin = minutesFromGridStart(clipEnd);
                      if (endMin <= 0 || topMin >= GRID_HOURS * 60) return null;
                      topMin = Math.max(0, topMin);
                      endMin = Math.min(GRID_HOURS * 60, endMin);
                      if (endMin <= topMin) return null;
                      return { sesiune: s, topMin, endMin };
                    })
                    .filter(
                      (
                        x,
                      ): x is {
                        sesiune: Sesiune;
                        topMin: number;
                        endMin: number;
                      } => x != null,
                    ),
                  hourPx,
                );
                return (
                  <div
                    key={key}
                    className="relative cursor-cell"
                    style={{
                      height: gridContentPx,
                      minHeight: gridContentPx,
                      flexShrink: 0,
                      background: isToday
                        ? TODAY_WASH
                        : isWeekend
                          ? WEEKEND_WASH
                          : GRID_BG,
                      boxShadow: `inset 1px 0 0 ${HOUR_LINE}`,
                    }}
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const y = e.clientY - rect.top - GUTTER_PAD_TOP;
                      let hour = HOUR_START + Math.floor(y / hourPx);
                      if (hour < HOUR_START) hour = HOUR_START;
                      if (hour >= HOUR_END) hour = HOUR_END - 1;
                      openAdd(d, hour);
                    }}
                  >
                    {Array.from({ length: GRID_HOURS }, (_, i) => (
                      <div key={`h-${i}`}>
                        <div
                          className="pointer-events-none absolute inset-x-0"
                          style={{
                            top: gridYFromMins(i * 60, hourPx),
                            borderTop: `1px solid ${HOUR_LINE}`,
                          }}
                        />
                        <div
                          className="pointer-events-none absolute inset-x-0"
                          style={{
                            top: gridYFromMins(i * 60 + 30, hourPx),
                            borderTop: `1px solid ${HALF_LINE}`,
                          }}
                        />
                      </div>
                    ))}
                    <div
                      className="pointer-events-none absolute inset-x-0"
                      style={{
                        top: gridYFromMins(GRID_HOURS * 60, hourPx),
                        borderTop: `1px solid ${HOUR_LINE}`,
                      }}
                    />

                    {laidOut.map((ev) => (
                      <EventChip
                        key={`${ev.sesiune.id}-${key}`}
                        sesiune={ev.sesiune}
                        top={ev.top}
                        height={ev.height}
                        col={ev.col}
                        onOpen={() => openEdit(ev.sesiune)}
                      />
                    ))}
                  </div>
                );
              })}

              {/* Multi-day Lunch overlay (week only) */}
              {viewMode === "week" && multiDayLunch.length > 0 ? (
                <div className="pointer-events-none absolute inset-y-0 right-0 z-[5]" style={{ left: GUTTER_W }}>
                  {multiDayLunch.map((s) => {
                    const start = parseLocal(s.starts_at);
                    const end = parseLocal(s.ends_at);
                    if (!start || !end) return null;
                    const startKey = ymd(start);
                    const endKey = ymd(end);
                    let startIdx = weekDays.findIndex(
                      (d) => ymd(d) === startKey,
                    );
                    let endIdx = weekDays.findIndex((d) => ymd(d) === endKey);
                    if (startIdx < 0 && startKey < ymd(weekDays[0]))
                      startIdx = 0;
                    if (endIdx < 0 && endKey > ymd(weekDays[6])) endIdx = 6;
                    if (startIdx < 0 || endIdx < 0 || endIdx < startIdx)
                      return null;
                    const topMin = Math.max(0, minutesFromGridStart(start));
                    const endMin = Math.min(
                      GRID_HOURS * 60,
                      Math.max(
                        topMin + 30,
                        end.getHours() * 60 +
                          end.getMinutes() -
                          HOUR_START * 60,
                      ),
                    );
                    const top = gridYFromMins(topMin, hourPx);
                    const height = Math.max(
                      hourPx / 2 - 1,
                      ((endMin - topMin) / 60) * hourPx - 1,
                    );
                    const leftPct = (startIdx / 7) * 100;
                    const widthPct = ((endIdx - startIdx + 1) / 7) * 100;
                    return (
                      <div
                        key={s.id}
                        className="pointer-events-auto absolute px-0.5"
                        style={{
                          top,
                          height,
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                        }}
                      >
                        <EventChip
                          sesiune={s}
                          top={0}
                          height={height}
                          onOpen={() => openEdit(s)}
                          fillParent
                        />
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {/* Now line — today's column only, when viewing this week */}
              {isViewingCurrentWeek && nowTopPx != null
                ? (() => {
                    const todayIdx = gridDays.findIndex(
                      (d) => ymd(d) === todayYmd,
                    );
                    if (todayIdx < 0) return null;
                    return (
                      <div
                        className="pointer-events-none absolute z-10"
                        style={{
                          top: nowTopPx,
                          left: `calc(${GUTTER_W}px + (100% - ${GUTTER_W}px) * ${todayIdx} / ${colCount})`,
                          width: `calc((100% - ${GUTTER_W}px) / ${colCount})`,
                        }}
                        aria-hidden
                      >
                        <div
                          className="w-full"
                          style={{
                            height: 1,
                            background: NOW_COLOR,
                          }}
                        />
                      </div>
                    );
                  })()
                : null}
            </div>
          </div>
        </div>
      </div>

      {/* Edit panel */}
      {selected ? (
        <div className="flex w-[300px] shrink-0 flex-col border-l border-[#E8E2D6] bg-white">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#E8E2D6] px-4">
            <span className="min-w-0 truncate text-sm font-medium text-foreground">
              {chipPrimary(selected)}
            </span>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-foreground/45 transition hover:text-foreground"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <form
            onSubmit={onSaveEdit}
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3"
          >
            <p className="text-xs text-foreground/50">
              {fmtTime(selected.starts_at)}–{fmtTime(selected.ends_at)}
              {selected.tip === "pregatire" ? " · prep" : ""}
              {selected.tip === "personal" ? " · personal" : ""}
            </p>

            {selected.cursant_cod ? (
              <Link
                href={`/dosar/${encodeURIComponent(selected.cursant_cod)}`}
                className="text-xs font-medium text-accent underline-offset-2 hover:underline"
              >
                Open dossier {selected.cursant_cod}
              </Link>
            ) : null}

            <label className="block text-xs font-medium text-foreground/60">
              Status
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as SesiuneStatus)}
                className="mt-1 w-full rounded-md border border-[#E8E2D6] bg-[#F4EFE6] px-2.5 py-2 text-sm text-foreground outline-none ring-honey/40 focus:ring-2"
              >
                {STATUS_OPTS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-medium text-foreground/60">
              Title
              <input
                value={editTitlu}
                onChange={(e) => setEditTitlu(e.target.value)}
                className="mt-1 w-full rounded-md border border-[#E8E2D6] bg-[#F4EFE6] px-2.5 py-2 text-sm text-foreground outline-none ring-honey/40 focus:ring-2"
                placeholder={selected.tip === "personal" ? "Required" : ""}
              />
            </label>

            <label className="block text-xs font-medium text-foreground/60">
              Note
              <textarea
                value={editNota}
                onChange={(e) => setEditNota(e.target.value)}
                rows={4}
                className="mt-1 w-full resize-none rounded-md border border-[#E8E2D6] bg-[#F4EFE6] px-2.5 py-2 text-sm text-foreground outline-none ring-honey/40 focus:ring-2"
              />
            </label>

            {saveError ? (
              <p className="text-xs text-red-800" role="alert">
                {saveError}
              </p>
            ) : null}

            <div className="mt-auto flex items-center gap-2 pt-2">
              <button
                type="submit"
                disabled={savePending}
                className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accent/90 disabled:opacity-60"
              >
                {savePending ? "…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => void onDelete()}
                disabled={savePending}
                className="rounded-md px-2 py-2 text-sm text-red-800/80 transition hover:bg-red-50 disabled:opacity-60"
              >
                Delete
              </button>
            </div>
          </form>
        </div>
      ) : null}
      </div>

      {addOpen ? (
        <AddModal
          tab={addTab}
          setTab={setAddTab}
          cursanti={cursanti}
          lectori={lectori}
          isAdmin={!!isAdmin}
          me={me}
          defaultLector={lectorFilter || me?.username || ""}
          presetDate={addPresetDate}
          presetTime={addPresetTime}
          onClose={() => {
            setAddOpen(false);
            setAddPresetDate(null);
            setAddPresetTime(null);
          }}
          onCreated={async () => {
            setAddOpen(false);
            setAddPresetDate(null);
            setAddPresetTime(null);
            await loadSesiuni();
            await loadRail();
          }}
        />
      ) : null}
    </div>
  );
}

function EventChip({
  sesiune: s,
  top,
  height,
  onOpen,
  fillParent = false,
  col = 0,
}: {
  sesiune: Sesiune;
  top: number;
  height: number;
  onOpen: () => void;
  fillParent?: boolean;
  /** Overlap stack index; each step insets 8px from the right. */
  col?: number;
}) {
  const primary = chipPrimary(s);
  const timeLabel = `${fmtTime(s.starts_at)}–${fmtTime(s.ends_at)}`;
  const fullNote = (s.nota || "").trim();
  const showTime = height >= 28;
  const rightInset = 8 + col * OVERLAP_INSET;

  const posStyle = fillParent
    ? { left: 4, width: `calc(100% - ${rightInset}px)` }
    : {
        top,
        height,
        left: 4,
        width: `calc(100% - ${rightInset}px)`,
        zIndex: 2 + col,
      };

  return (
    <button
      type="button"
      title={
        [primary, timeLabel, fullNote].filter(Boolean).join(" · ") || primary
      }
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      className={[
        "absolute cursor-pointer overflow-hidden text-left",
        fillParent ? "inset-y-0" : "",
        s.status === "anulat" ? "opacity-45" : "",
        s.status === "no_show" ? "opacity-70" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        ...posStyle,
        borderRadius: 4,
        background: SESSION_FILL,
        border: "none",
        borderLeft: `3px solid ${SESSION_EDGE}`,
        boxShadow: "none",
        padding: "4px 6px",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = SESSION_FILL_HOVER;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = SESSION_FILL;
      }}
    >
      <div
        className="truncate font-semibold"
        style={{
          color: EVENT_TITLE,
          fontSize: 12,
          lineHeight: "16px",
          fontWeight: 600,
        }}
      >
        {primary}
      </div>
      {showTime ? (
        <div
          className="truncate"
          style={{
            color: EVENT_TIME,
            fontSize: 11,
            lineHeight: "14px",
          }}
        >
          {timeLabel}
        </div>
      ) : null}
    </button>
  );
}

function AddModal({
  tab,
  setTab,
  cursanti,
  lectori,
  isAdmin,
  me,
  defaultLector,
  presetDate,
  presetTime,
  onClose,
  onCreated,
}: {
  tab: "session" | "personal";
  setTab: (t: "session" | "personal") => void;
  cursanti: Cursant[];
  lectori: Lector[];
  isAdmin: boolean;
  me: Me | null;
  defaultLector: string;
  presetDate: string | null;
  presetTime: string | null;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const router = useRouter();
  const today = ymd(new Date());
  const [cod, setCod] = useState("");
  const [date, setDate] = useState(presetDate || today);
  const [time, setTime] = useState(presetTime || "10:00");
  const [duration, setDuration] = useState(30);
  const [prep, setPrep] = useState(false);
  const [titlu, setTitlu] = useState("");
  const [sessionTitlu, setSessionTitlu] = useState("");
  const [lector, setLector] = useState(defaultLector);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState("");

  const [bookDay, setBookDay] = useState<Date | null>(() =>
    presetDate
      ? new Date(
          Number(presetDate.slice(0, 4)),
          Number(presetDate.slice(5, 7)) - 1,
          Number(presetDate.slice(8, 10)),
        )
      : null,
  );
  const [bookSlot, setBookSlot] = useState<string | null>(presetTime);
  const [weekBusy, setWeekBusy] = useState<Sesiune[]>([]);

  const lectorUsername =
    isAdmin && lector ? lector : me?.username || "";

  const onWeekChange = useCallback(
    async (weekStart: Date) => {
      const from = `${ymd(weekStart)}T00:00:00`;
      const to = `${ymd(addDays(weekStart, 7))}T00:00:00`;
      const q = new URLSearchParams({ from, to });
      if (lectorUsername) q.set("lector", lectorUsername);
      try {
        const res = await apiFetch(`/sesiuni?${q.toString()}`);
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (!res.ok) {
          setWeekBusy([]);
          return;
        }
        const data = (await res.json()) as Sesiune[];
        setWeekBusy(Array.isArray(data) ? data : []);
      } catch {
        setWeekBusy([]);
      }
    },
    [lectorUsername, router],
  );

  const lectorBootRef = useRef(lectorUsername);
  useEffect(() => {
    if (lectorUsername === lectorBootRef.current) return;
    lectorBootRef.current = lectorUsername;
    setBookDay(null);
    setBookSlot(null);
  }, [lectorUsername]);

  const isSlotTaken = useCallback(
    (day: Date, slot: string) => {
      const parsed = parseBookingSlot(slot);
      if (!parsed) return false;
      const slotStart = new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        parsed.hours,
        parsed.minutes,
        0,
      );
      const slotEnd = new Date(slotStart.getTime() + duration * 60_000);
      return weekBusy.some((s) => {
        if ((s.status || "").toLowerCase() === "anulat") return false;
        const a = parseLocal(s.starts_at);
        const b = parseLocal(s.ends_at);
        if (!a || !b) return false;
        return slotStart < b && slotEnd > a;
      });
    },
    [weekBusy, duration],
  );

  const sessionReady = !!cod && !!bookDay && !!bookSlot;

  const initialBookDay = useMemo(() => {
    if (!presetDate) return undefined;
    return new Date(
      Number(presetDate.slice(0, 4)),
      Number(presetDate.slice(5, 7)) - 1,
      Number(presetDate.slice(8, 10)),
    );
  }, [presetDate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setErr("");
    try {
      const lector_username = lectorUsername;

      if (tab === "personal") {
        if (!titlu.trim()) {
          setErr("Title is required.");
          setPending(false);
          return;
        }
        const [hh, mm] = time.split(":").map(Number);
        const start = new Date(
          Number(date.slice(0, 4)),
          Number(date.slice(5, 7)) - 1,
          Number(date.slice(8, 10)),
          hh || 0,
          mm || 0,
          0,
        );
        const end = new Date(start.getTime() + duration * 60_000);
        const res = await apiFetch("/sesiuni", {
          method: "POST",
          body: JSON.stringify({
            tip: "personal",
            titlu: titlu.trim(),
            starts_at: toLocalIso(start),
            ends_at: toLocalIso(end),
            ...(isAdmin && lector_username ? { lector_username } : {}),
          }),
        });
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (!res.ok) {
          setErr("Could not create.");
          return;
        }
      } else {
        if (!cod || !bookDay || !bookSlot) {
          setErr("Pick a student and a slot.");
          setPending(false);
          return;
        }
        const parsed = parseBookingSlot(bookSlot);
        if (!parsed) {
          setErr("Invalid slot.");
          setPending(false);
          return;
        }
        const start = new Date(
          bookDay.getFullYear(),
          bookDay.getMonth(),
          bookDay.getDate(),
          parsed.hours,
          parsed.minutes,
          0,
        );
        const end = new Date(start.getTime() + duration * 60_000);
        const callTitlu = sessionTitlu.trim();
        if (prep) {
          const prepStart = new Date(start.getTime() - 15 * 60_000);
          const prepRes = await apiFetch("/sesiuni", {
            method: "POST",
            body: JSON.stringify({
              tip: "pregatire",
              cursant_cod: cod,
              starts_at: toLocalIso(prepStart),
              ends_at: toLocalIso(start),
              titlu: callTitlu,
              ...(isAdmin && lector_username ? { lector_username } : {}),
            }),
          });
          if (prepRes.status === 401) {
            router.replace("/login");
            return;
          }
          if (!prepRes.ok) {
            setErr("Could not create prep.");
            return;
          }
        }
        const res = await apiFetch("/sesiuni", {
          method: "POST",
          body: JSON.stringify({
            tip: "call",
            cursant_cod: cod,
            starts_at: toLocalIso(start),
            ends_at: toLocalIso(end),
            titlu: callTitlu,
            ...(isAdmin && lector_username ? { lector_username } : {}),
          }),
        });
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (!res.ok) {
          setErr("Could not create session.");
          return;
        }
      }
      await onCreated();
    } catch {
      setErr("Could not create.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/25 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Add"
    >
      <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-[#E8E2D6] bg-white shadow-lg">
        <div className="flex shrink-0 items-center justify-between border-b border-[#E8E2D6] bg-white px-4 py-3">
          <div className="flex gap-1 rounded-md bg-[#F4EFE6] p-0.5">
            <button
              type="button"
              onClick={() => setTab("session")}
              className={
                tab === "session"
                  ? "rounded px-3 py-1.5 text-xs font-medium bg-accent/15 text-accent"
                  : "rounded px-3 py-1.5 text-xs text-foreground/55"
              }
            >
              Session
            </button>
            <button
              type="button"
              onClick={() => setTab("personal")}
              className={
                tab === "personal"
                  ? "rounded px-3 py-1.5 text-xs font-medium bg-accent/15 text-accent"
                  : "rounded px-3 py-1.5 text-xs text-foreground/55"
              }
            >
              Personal block
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-foreground/45 hover:text-foreground"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form
          onSubmit={submit}
          className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3"
        >
          {isAdmin ? (
            <label className="block shrink-0 text-xs font-medium text-foreground/60">
              Lecturer
              <select
                value={lector}
                onChange={(e) => setLector(e.target.value)}
                className="mt-1 w-full rounded-md border border-[#E8E2D6] bg-[#F4EFE6] px-2.5 py-2 text-sm outline-none ring-honey/40 focus:ring-2"
              >
                <option value="">—</option>
                {lectori.map((l) => (
                  <option key={l.username} value={l.username}>
                    {l.name || l.username}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {tab === "session" ? (
            <>
              <label className="block shrink-0 text-xs font-medium text-foreground/60">
                Student
                <select
                  value={cod}
                  onChange={(e) => setCod(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[#E8E2D6] bg-[#F4EFE6] px-2.5 py-2 text-sm outline-none ring-honey/40 focus:ring-2"
                  required
                >
                  <option value="">—</option>
                  {cursanti.map((c) => (
                    <option key={c.cod} value={c.cod}>
                      {c.cod} · {c.nume}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block shrink-0 text-xs font-medium text-foreground/60">
                Title
                <input
                  value={sessionTitlu}
                  onChange={(e) => setSessionTitlu(e.target.value)}
                  placeholder="e.g. Role-play objections"
                  className="mt-1 w-full rounded-md border border-[#E8E2D6] bg-[#F4EFE6] px-2.5 py-2 text-sm outline-none ring-honey/40 placeholder:text-foreground/35 focus:ring-2"
                />
              </label>

              <div className="flex min-h-0 flex-1 justify-center overflow-hidden py-0.5">
                <BookingSlotCalendar
                  key={`${lectorUsername}-${duration}-${presetDate}-${presetTime}`}
                  subtitle={`${duration} min · coaching call`}
                  durationMinutes={duration}
                  isSlotTaken={isSlotTaken}
                  initialDay={initialBookDay}
                  initialSlot={presetTime ?? undefined}
                  onWeekChange={(ws) => void onWeekChange(ws)}
                  onPick={(day, slot) => {
                    setBookDay(day);
                    setBookSlot(slot);
                  }}
                />
              </div>

              <label className="block shrink-0 text-xs font-medium text-foreground/60">
                Duration
                <select
                  value={duration}
                  onChange={(e) => {
                    setDuration(Number(e.target.value));
                    setBookSlot(null);
                    setBookDay(null);
                  }}
                  className="mt-1 w-full rounded-md border border-[#E8E2D6] bg-[#F4EFE6] px-2.5 py-2 text-sm outline-none ring-honey/40 focus:ring-2"
                >
                  <option value={30}>30 min</option>
                  <option value={45}>45 min</option>
                  <option value={60}>60 min</option>
                </select>
              </label>

              <label className="flex shrink-0 items-center gap-2 text-sm text-foreground/75">
                <input
                  type="checkbox"
                  checked={prep}
                  onChange={(e) => setPrep(e.target.checked)}
                  className="accent-accent"
                />
                +15 min prep before
              </label>
            </>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-2.5">
              <label className="block text-xs font-medium text-foreground/60">
                Title
                <input
                  value={titlu}
                  onChange={(e) => setTitlu(e.target.value)}
                  required
                  className="mt-1 w-full rounded-md border border-[#E8E2D6] bg-[#F4EFE6] px-2.5 py-2 text-sm outline-none ring-honey/40 focus:ring-2"
                />
              </label>

              <label className="block w-full text-xs font-medium text-foreground/60">
                Date
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className="mt-1 min-h-[44px] w-full rounded-md border border-[#E8E2D6] bg-[#F4EFE6] px-2.5 py-2 text-sm outline-none ring-honey/40 focus:ring-2"
                />
              </label>

              <div className="flex w-full flex-col gap-2 sm:flex-row sm:gap-2">
                <label className="block min-w-0 flex-1 text-xs font-medium text-foreground/60">
                  Start
                  <select
                    value={time}
                    onChange={(e) => {
                      const next = e.target.value;
                      setTime(next);
                      const startMins = timeToMinutes(next);
                      const endMins = startMins + duration;
                      if (endMins > HOUR_END * 60) {
                        const allowed = [120, 90, 60, 45, 30].find(
                          (d) => startMins + d <= HOUR_END * 60,
                        );
                        setDuration(allowed ?? 30);
                      }
                    }}
                    required
                    className="mt-1 min-h-[44px] w-full rounded-md border border-[#E8E2D6] bg-[#F4EFE6] px-2.5 py-2 text-sm outline-none ring-honey/40 focus:ring-2"
                  >
                    {TIME_OPTIONS_30.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block min-w-0 flex-1 text-xs font-medium text-foreground/60">
                  End
                  <select
                    value={minutesToTimeStr(timeToMinutes(time) + duration)}
                    onChange={(e) => {
                      const diff =
                        timeToMinutes(e.target.value) - timeToMinutes(time);
                      if (diff > 0) setDuration(diff);
                    }}
                    required
                    className="mt-1 min-h-[44px] w-full rounded-md border border-[#E8E2D6] bg-[#F4EFE6] px-2.5 py-2 text-sm outline-none ring-honey/40 focus:ring-2"
                  >
                    {[30, 45, 60, 90, 120]
                      .map((d) => ({
                        d,
                        t: minutesToTimeStr(timeToMinutes(time) + d),
                      }))
                      .filter(({ t }) => timeToMinutes(t) <= HOUR_END * 60)
                      .map(({ d, t }) => (
                        <option key={d} value={t}>
                          {t}
                        </option>
                      ))}
                  </select>
                </label>
              </div>

              <label className="block text-xs font-medium text-foreground/60">
                Duration
                <select
                  value={duration}
                  onChange={(e) => {
                    const d = Number(e.target.value);
                    if (timeToMinutes(time) + d <= HOUR_END * 60) {
                      setDuration(d);
                    }
                  }}
                  className="mt-1 w-full rounded-md border border-[#E8E2D6] bg-[#F4EFE6] px-2.5 py-2 text-sm outline-none ring-honey/40 focus:ring-2"
                >
                  <option value={30}>30 min</option>
                  <option value={45}>45 min</option>
                  <option value={60}>60 min</option>
                  <option value={90}>90 min</option>
                  <option value={120}>2 h</option>
                </select>
              </label>
            </div>
          )}

          {err ? (
            <p className="shrink-0 text-xs text-red-800" role="alert">
              {err}
            </p>
          ) : null}

          <div className="flex shrink-0 justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-2 text-sm text-foreground/60 hover:bg-[#F4EFE6]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                pending || (tab === "session" ? !sessionReady : !titlu.trim())
              }
              className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
            >
              {pending ? "…" : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
