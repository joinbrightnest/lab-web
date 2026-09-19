"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookingSlotCalendar,
  parseBookingSlot,
} from "@/components/BookingSlotCalendar";
import { apiFetch, type SloturiItem, type StudentCall } from "@/lib/api";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function toLocalIso(d: Date): string {
  return `${ymd(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:00`;
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

function fmtBookedLabel(iso: string): string {
  const d = parseLocal(iso);
  if (!d) return iso;
  const day = d.toLocaleDateString("en-US", { weekday: "short" });
  return `${day} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function addMinutes(d: Date, mins: number): Date {
  return new Date(d.getTime() + mins * 60_000);
}

type Props = {
  initialUpcoming?: StudentCall[];
  onUnauthorized?: () => void;
};

export function StudentBookCall({
  initialUpcoming = [],
  onUnauthorized,
}: Props) {
  const [slots, setSlots] = useState<SloturiItem[]>([]);
  const [upcoming, setUpcoming] = useState<StudentCall[]>(initialUpcoming);
  const [loading, setLoading] = useState(true);
  const [pick, setPick] = useState<{ starts_at: string; ends_at: string } | null>(
    null,
  );
  const [booking, setBooking] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadSlots = useCallback(async () => {
    const now = new Date();
    const to = addMinutes(now, 14 * 24 * 60);
    const from = toLocalIso(now);
    const toS = toLocalIso(to);
    const res = await apiFetch(
      `/sloturi?from=${encodeURIComponent(from)}&to=${encodeURIComponent(toS)}`,
    );
    if (res.status === 401) {
      onUnauthorized?.();
      return;
    }
    if (!res.ok) {
      setSlots([]);
      return;
    }
    setSlots((await res.json()) as SloturiItem[]);
  }, [onUnauthorized]);

  useEffect(() => {
    setUpcoming(initialUpcoming);
  }, [initialUpcoming]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadSlots();
      } catch {
        if (!cancelled) setError("Could not load slots.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSlots]);

  const availableKeys = useMemo(() => {
    const set = new Set<string>();
    for (const s of slots) {
      const d = parseLocal(s.starts_at);
      if (!d) continue;
      set.add(`${ymd(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`);
    }
    return set;
  }, [slots]);

  const isSlotTaken = useCallback(
    (date: Date, slot: string) => {
      const p = parseBookingSlot(slot);
      if (!p) return true;
      const key = `${ymd(date)}T${pad2(p.hours)}:${pad2(p.minutes)}`;
      return !availableKeys.has(key);
    },
    [availableKeys],
  );

  const onPick = (date: Date, slot: string) => {
    const p = parseBookingSlot(slot);
    if (!p) return;
    const start = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      p.hours,
      p.minutes,
      0,
    );
    const end = addMinutes(start, 30);
    setPick({ starts_at: toLocalIso(start), ends_at: toLocalIso(end) });
    setConfirm(null);
    setError("");
  };

  async function onBook() {
    if (!pick || booking) return;
    setBooking(true);
    setError("");
    try {
      const res = await apiFetch("/sloturi", {
        method: "POST",
        body: JSON.stringify(pick),
      });
      if (res.status === 401) {
        onUnauthorized?.();
        return;
      }
      if (res.status === 409) {
        setError("That slot was just taken.");
        await loadSlots();
        setPick(null);
        return;
      }
      if (!res.ok) {
        setError("Could not book.");
        return;
      }
      const json = (await res.json()) as {
        sesiune?: { id: number; starts_at: string; ends_at: string };
      };
      const s = json.sesiune;
      if (s) {
        setConfirm(fmtBookedLabel(s.starts_at));
        setUpcoming((prev) => {
          const next = [
            ...prev.filter((c) => c.id !== s.id),
            { id: s.id, starts_at: s.starts_at, ends_at: s.ends_at },
          ];
          next.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
          return next;
        });
      }
      setPick(null);
      await loadSlots();
    } catch {
      setError("Could not book.");
    } finally {
      setBooking(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-honey">
        Book a call
      </h2>
      <p className="text-sm text-foreground/60">30 min · with your lecturer</p>

      {confirm ? (
        <p className="text-sm font-medium text-accent">Booked. {confirm}</p>
      ) : null}

      {upcoming.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm text-foreground/80">
          {upcoming.map((c) => (
            <li key={c.id ?? `${c.starts_at}-${c.ends_at}`} className="tabular-nums">
              {fmtBookedLabel(c.starts_at)}
              {c.titlu ? (
                <span className="text-foreground/50"> · {c.titlu}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {loading ? (
        <p className="text-sm text-foreground/50">Loading slots…</p>
      ) : slots.length === 0 ? (
        <p className="text-sm text-foreground/60">
          No open hours yet. Your lecturer sets when they take calls.
        </p>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <BookingSlotCalendar
            title="Book a call"
            subtitle="30 min · coaching call"
            isSlotTaken={isSlotTaken}
            onPick={onPick}
          />
          <div className="flex flex-col gap-2 pt-1">
            {pick ? (
              <p className="text-sm text-foreground/70">
                Selected:{" "}
                <span className="font-medium text-accent">
                  {fmtBookedLabel(pick.starts_at)}
                </span>
              </p>
            ) : (
              <p className="text-sm text-foreground/50">Pick a day and time.</p>
            )}
            <button
              type="button"
              disabled={!pick || booking}
              onClick={() => void onBook()}
              className="rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-[#F4EFE6] transition hover:brightness-110 disabled:opacity-60"
            >
              {booking ? "Booking…" : "Book"}
            </button>
          </div>
        </div>
      )}

      {error ? (
        <p className="text-sm font-medium text-red-800" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
