"use client";

import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BrightNestMark } from "@/components/BrightNestMark";
import { cn } from "@/lib/cn";

/** Every 30 min · 08:00–20:00 local (inclusive). */
export const BOOKING_SLOTS: readonly string[] = (() => {
  const out: string[] = [];
  for (let mins = 8 * 60; mins <= 20 * 60; mins += 30) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
  return out;
})();

/** Scrollable time grid only — ~220px */
const SLOT_PANE_H = 220;

function addMinutesToSlot(slot: string, mins: number): string {
  const p = parseBookingSlot(slot);
  if (!p) return slot;
  const total = p.hours * 60 + p.minutes + mins;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function parseBookingSlot(
  slot: string,
): { hours: number; minutes: number } | null {
  const raw = (slot || "").trim();
  const h24 = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (h24) {
    const hours = Number(h24[1]);
    const minutes = Number(h24[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return { hours, minutes };
    }
    return null;
  }
  const m = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = Number(m[2]);
  const ap = m[3].toUpperCase();
  if (ap === "AM") {
    if (hours === 12) hours = 0;
  } else if (hours !== 12) {
    hours += 12;
  }
  return { hours, minutes };
}

function startOfWeek(date: Date) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() - copy.getDay());
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function isSameDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function isBeforeDay(date: Date, day: Date) {
  return startOfDay(date).getTime() < startOfDay(day).getTime();
}

function slotStartMs(day: Date, slot: string): number | null {
  const p = parseBookingSlot(slot);
  if (!p) return null;
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    p.hours,
    p.minutes,
    0,
  ).getTime();
}

/** First scroll target: next slot after now (today), else 10:00. */
function defaultScrollSlot(day: Date, now: Date, slots: readonly string[]): string {
  if (isSameDate(day, startOfDay(now))) {
    const nowMs = now.getTime();
    for (const s of slots) {
      const t = slotStartMs(day, s);
      if (t != null && t > nowMs) return s;
    }
    return slots[slots.length - 1] ?? "10:00";
  }
  return slots.includes("10:00") ? "10:00" : (slots[0] ?? "10:00");
}

function isSlotPastToday(day: Date, slot: string, now: Date): boolean {
  if (!isSameDate(day, startOfDay(now))) return false;
  const t = slotStartMs(day, slot);
  if (t == null) return false;
  return t <= now.getTime();
}

export type BookingSlotCalendarProps = Readonly<
  {
    slots?: readonly string[];
    /** Return true when this day+slot overlaps an existing session. */
    isSlotTaken?: (date: Date, slot: string) => boolean;
    /** Fires when the visible week changes (including mount). */
    onWeekChange?: (weekStart: Date) => void;
    /**
     * Selection only — does not submit.
     * Parent should set local state; POST on Add.
     */
    onPick?: (date: Date, slot: string) => void;
    /** Prefill day (e.g. empty-cell click on calendar). */
    initialDay?: Date;
    /** Prefill slot HH:mm when opening with a start hour. */
    initialSlot?: string;
    title?: string;
    subtitle?: string;
    /** End time = start + this many minutes (summary line). */
    durationMinutes?: number;
  } & Omit<ComponentPropsWithoutRef<"div">, "title">
>;

/**
 * Week-strip + time-slot picker (BrightNest).
 * Adapted from Opensource UI BookingSlotCalendar — pickSlot sets state only.
 */
export const BookingSlotCalendar = forwardRef<
  HTMLDivElement,
  BookingSlotCalendarProps
>(
  (
    {
      className,
      slots = BOOKING_SLOTS,
      isSlotTaken,
      onWeekChange,
      onPick,
      initialDay,
      initialSlot,
      title = "Add session",
      subtitle = "30 min · coaching call",
      durationMinutes = 30,
      ...props
    },
    ref,
  ) => {
    const today = useMemo(() => startOfDay(new Date()), []);
    const nowRef = useRef(new Date());
    const seedDay = initialDay ? startOfDay(initialDay) : today;
    const [weekStart, setWeekStart] = useState(() => startOfWeek(seedDay));
    const [selectedDay, setSelectedDay] = useState(seedDay);
    const [selectedSlot, setSelectedSlot] = useState<string | null>(
      () => initialSlot ?? null,
    );
    const [focusSlot, setFocusSlot] = useState<string | null>(null);
    const [slideDirection, setSlideDirection] = useState(0);
    const [dayAnim, setDayAnim] = useState(0);

    const scrollRef = useRef<HTMLDivElement>(null);
    const slotBtnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

    const days = useMemo(
      () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
      [weekStart],
    );

    const canGoPrev = !isBeforeDay(addDays(weekStart, -1), today);

    const monthLabel = days[3]?.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });

    const weekdayShort = selectedDay.toLocaleDateString("en-US", {
      weekday: "short",
    });
    const selectionSummary = selectedSlot
      ? `${weekdayShort} ${selectedDay.getDate()} · ${selectedSlot}–${addMinutesToSlot(selectedSlot, durationMinutes)}`
      : `${weekdayShort} ${selectedDay.getDate()}`;

    useEffect(() => {
      onWeekChange?.(weekStart);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- notify parent on week only
    }, [weekStart]);

    // Prefill from calendar empty-cell click
    useEffect(() => {
      if (!initialDay || !initialSlot) return;
      const day = startOfDay(initialDay);
      setSelectedDay(day);
      setWeekStart(startOfWeek(day));
      setSelectedSlot(initialSlot);
      setFocusSlot(initialSlot);
      onPick?.(day, initialSlot);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- mount/prefill once per open
    }, []);

    // Scroll to next-after-now (today) or 10:00 when day opens / changes
    useEffect(() => {
      nowRef.current = new Date();
      const target = defaultScrollSlot(selectedDay, nowRef.current, slots);
      setFocusSlot(target);
      const id = requestAnimationFrame(() => {
        const el = slotBtnRefs.current.get(target);
        el?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
      return () => cancelAnimationFrame(id);
    }, [selectedDay, slots]);

    const slotDisabled = (slot: string) => {
      if (isBeforeDay(selectedDay, today)) return true;
      if (isSlotPastToday(selectedDay, slot, nowRef.current)) return true;
      if (isSlotTaken?.(selectedDay, slot)) return true;
      return false;
    };

    const pickDay = (date: Date) => {
      if (isBeforeDay(date, today)) return;
      setSelectedDay(startOfDay(date));
      setSelectedSlot(null);
      setDayAnim((n) => n + 1);
    };

    const pickSlot = (slot: string) => {
      if (slotDisabled(slot)) return;
      setSelectedSlot(slot);
      setFocusSlot(slot);
      onPick?.(selectedDay, slot);
    };

    const enabledSlots = useMemo(
      () => slots.filter((s) => !slotDisabled(s)),
      // slotDisabled depends on selectedDay / taken / now
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [slots, selectedDay, isSlotTaken],
    );

    const moveFocus = (dir: -1 | 1) => {
      const list = enabledSlots.length ? enabledSlots : [...slots];
      const cur = focusSlot && list.includes(focusSlot) ? focusSlot : list[0];
      if (!cur) return;
      const idx = list.indexOf(cur);
      const next = list[Math.max(0, Math.min(list.length - 1, idx + dir))];
      if (!next) return;
      setFocusSlot(next);
      slotBtnRefs.current.get(next)?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
      slotBtnRefs.current.get(next)?.focus({ preventScroll: true });
    };

    const onSlotKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveFocus(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        moveFocus(-1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (focusSlot) pickSlot(focusSlot);
      }
    };

    const goPrevWeek = () => {
      if (!canGoPrev) return;
      setSlideDirection(-1);
      setWeekStart((prev) => addDays(prev, -7));
    };

    const goNextWeek = () => {
      setSlideDirection(1);
      setWeekStart((prev) => addDays(prev, 7));
    };

    return (
      <div
        ref={ref}
        data-slot="booking-slot-calendar"
        className={cn(
          "flex w-80 shrink-0 flex-col overflow-hidden rounded-2xl border border-[#e6e0d4] bg-[#F4EFE6] font-sans select-none",
          className,
        )}
        {...props}
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-[#e6e0d4] px-5 py-3">
          <span className="flex size-9 shrink-0 items-center justify-center">
            <BrightNestMark size={28} className="h-7 w-7 object-contain" />
          </span>
          <div className="min-w-0">
            <p
              className="text-sm font-semibold text-[#1a2e24]"
              style={{ fontFamily: "var(--font-fraunces), serif" }}
            >
              {title}
            </p>
            <p className="truncate text-xs text-[#1a2e24]/70">{subtitle}</p>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-5 pt-3 pb-4">
          <div className="mb-2.5 flex shrink-0 items-center justify-between">
            <button
              type="button"
              aria-label="Previous week"
              onClick={goPrevWeek}
              disabled={!canGoPrev}
              className={cn(
                "flex size-8 items-center justify-center rounded-full transition-colors duration-150 outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2C5F45]",
                canGoPrev
                  ? "cursor-pointer text-[#1a2e24]/55 hover:bg-[#2C5F45]/10 hover:text-[#2C5F45]"
                  : "cursor-not-allowed text-[#1a2e24]/25",
              )}
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <p className="text-xs font-medium text-[#1a2e24]/70">{monthLabel}</p>
            <button
              type="button"
              aria-label="Next week"
              onClick={goNextWeek}
              className={cn(
                "flex size-8 items-center justify-center rounded-full transition-colors duration-150 outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2C5F45]",
                "cursor-pointer text-[#1a2e24]/55 hover:bg-[#2C5F45]/10 hover:text-[#2C5F45]",
              )}
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>

          <div
            key={weekStart.toISOString()}
            className={cn(
              "mb-3 flex shrink-0 justify-between gap-1 opacity-100 transition-all duration-300 ease-out",
              slideDirection >= 0
                ? "starting:translate-x-2"
                : "starting:-translate-x-2",
            )}
          >
            {days.map((date) => {
              const active = isSameDate(date, selectedDay);
              const isToday = isSameDate(date, today);
              const past = isBeforeDay(date, today);
              return (
                <button
                  key={date.toISOString()}
                  type="button"
                  disabled={past}
                  onClick={() => pickDay(date)}
                  className={cn(
                    "group flex flex-col items-center gap-1 outline-none",
                    past ? "cursor-not-allowed" : "cursor-pointer",
                  )}
                >
                  <span
                    className={cn(
                      "text-[10px] font-medium tracking-wide uppercase",
                      past ? "text-[#1a2e24]/25" : "text-[#1a2e24]/50",
                    )}
                  >
                    {date.toLocaleDateString("en-US", { weekday: "narrow" })}
                  </span>
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full text-xs font-medium tabular-nums",
                      "transition-colors duration-150",
                      !past &&
                        "group-focus-visible:outline-2 group-focus-visible:outline-offset-1 group-focus-visible:outline-[#2C5F45]",
                      past && "text-[#1a2e24]/25",
                      !past &&
                        active &&
                        "bg-[#2C5F45] font-semibold text-[#F4EFE6]",
                      !past &&
                        !active &&
                        isToday &&
                        "bg-[#2C5F45]/12 font-semibold text-[#2C5F45] group-hover:bg-[#2C5F45]/20",
                      !past &&
                        !active &&
                        !isToday &&
                        "text-[#1a2e24] group-hover:bg-[#2C5F45]/10",
                    )}
                  >
                    {date.getDate()}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Static selection summary — outside the scroller */}
          <p
            key={selectionSummary}
            className="mb-2 shrink-0 text-xs font-medium tabular-nums text-[#1a2e24]/70 opacity-100 transition-all duration-300 ease-out starting:opacity-0"
          >
            {selectionSummary}
          </p>

          {/* Scrollable time grid only — no sticky/absolute children */}
          <div
            ref={scrollRef}
            role="listbox"
            aria-label="Time slots"
            tabIndex={0}
            onKeyDown={onSlotKeyDown}
            className={cn(
              "bn-slot-scroll min-h-0 shrink grid grid-cols-2 gap-1.5 overflow-y-auto overscroll-contain pr-0.5",
              "opacity-100 transition-all duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]",
              "starting:translate-y-2 starting:opacity-0",
              "outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2C5F45]",
            )}
            style={{ maxHeight: SLOT_PANE_H }}
            key={`${selectedDay.toISOString()}-${dayAnim}`}
          >
            {slots.map((slot) => {
              const disabled = slotDisabled(slot);
              const active = selectedSlot === slot;
              const focused = focusSlot === slot;
              return (
                <button
                  key={slot}
                  type="button"
                  role="option"
                  aria-selected={active}
                  aria-disabled={disabled}
                  disabled={disabled}
                  tabIndex={focused && !disabled ? 0 : -1}
                  ref={(el) => {
                    if (el) slotBtnRefs.current.set(slot, el);
                    else slotBtnRefs.current.delete(slot);
                  }}
                  onClick={() => pickSlot(slot)}
                  onFocus={() => setFocusSlot(slot)}
                  className={cn(
                    "h-8 rounded-lg text-xs font-medium tabular-nums outline-none",
                    "transition-colors duration-150",
                    "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2C5F45]",
                    disabled &&
                      "cursor-not-allowed bg-[#1a2e24]/[0.04] text-[#1a2e24]/35 line-through",
                    !disabled &&
                      active &&
                      "cursor-pointer bg-[#2C5F45] font-semibold text-[#F4EFE6]",
                    !disabled &&
                      !active &&
                      focused &&
                      "cursor-pointer bg-[#2C5F45]/15 text-[#2C5F45]",
                    !disabled &&
                      !active &&
                      !focused &&
                      "cursor-pointer bg-white/60 text-[#1a2e24]/80 hover:bg-[#2C5F45]/10 hover:text-[#2C5F45]",
                  )}
                >
                  {slot}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  },
);

BookingSlotCalendar.displayName = "BookingSlotCalendar";
