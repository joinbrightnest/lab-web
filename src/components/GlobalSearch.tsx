"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, type Cursant, type Lector } from "@/lib/api";

const MAX_RESULTS = 8;

type ResultItem =
  | { type: "student"; cod: string; label: string; sub: string }
  | { type: "lector"; username: string; label: string; sub: string };

/**
 * Global "Find in BrightNest" search — lives in the top strip on every Lab
 * page. Reads the already-auth-scoped /cursanti (+ /lectori for admins)
 * lists once per session; no new Flask route needed. Never touches the
 * Students table filter — this only opens a result dropdown.
 */
export function GlobalSearch({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [students, setStudents] = useState<Cursant[] | null>(null);
  const [lectors, setLectors] = useState<Lector[] | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (loaded) return;
    let cancelled = false;

    async function load() {
      try {
        const res = await apiFetch("/cursanti");
        if (res.ok) {
          const data = (await res.json()) as Cursant[];
          if (!cancelled) setStudents(data);
        }
      } catch {
        // dropdown just stays empty for students
      }
      if (isAdmin) {
        try {
          const res = await apiFetch("/lectori");
          if (res.ok) {
            const data = (await res.json()) as Lector[];
            if (!cancelled) setLectors(data);
          }
        } catch {
          // dropdown just stays empty for lecturers
        }
      }
      if (!cancelled) setLoaded(true);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, loaded]);

  const q = query.trim().toLowerCase();

  const matchedStudents = useMemo(() => {
    if (!q || !students) return [];
    return students
      .filter(
        (s) =>
          s.nume.toLowerCase().includes(q) || s.cod.toLowerCase().includes(q),
      )
      .slice(0, MAX_RESULTS);
  }, [q, students]);

  const matchedLectors = useMemo(() => {
    if (!q || !lectors) return [];
    return lectors
      .filter(
        (l) =>
          (l.name || "").toLowerCase().includes(q) ||
          l.username.toLowerCase().includes(q),
      )
      .slice(0, MAX_RESULTS);
  }, [q, lectors]);

  const results: ResultItem[] = useMemo(
    () => [
      ...matchedStudents.map((s) => ({
        type: "student" as const,
        cod: s.cod,
        label: s.nume,
        sub: s.cod,
      })),
      ...matchedLectors.map((l) => ({
        type: "lector" as const,
        username: l.username,
        label: l.name || l.username,
        sub: l.username,
      })),
    ],
    [matchedStudents, matchedLectors],
  );

  const open = q.length > 0 && !dismissed;

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setDismissed(true);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function onChangeQuery(value: string) {
    setQuery(value);
    setDismissed(false);
    setActiveIndex(0);
  }

  function goTo(item: ResultItem) {
    setDismissed(true);
    setQuery("");
    if (item.type === "student") router.push(`/dosar/${item.cod}`);
    else router.push("/lectori");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setDismissed(true);
      setQuery("");
      inputRef.current?.blur();
      return;
    }
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const item = results[activeIndex];
      if (item) goTo(item);
    }
  }

  return (
    <div ref={rootRef} className="lab-global-search relative">
      <svg
        viewBox="0 0 24 24"
        width="13"
        height="13"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="lab-global-search-icon pointer-events-none absolute right-[10px] top-1/2 -translate-y-1/2"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => onChangeQuery(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => setDismissed(false)}
        placeholder="Find in BrightNest"
        aria-label="Find in BrightNest"
        role="combobox"
        aria-expanded={open}
        aria-controls="global-search-listbox"
        autoComplete="off"
        className="lab-global-search-input outline-none"
      />

      {open && q ? (
        <div
          id="global-search-listbox"
          role="listbox"
          className="absolute left-0 top-full z-40 mt-1.5 w-full min-w-[280px] overflow-hidden rounded-lg border border-line bg-white text-sm shadow-lg"
        >
          {results.length === 0 ? (
            <p className="px-3 py-3 text-xs text-foreground/50">
              No results.
            </p>
          ) : (
            <>
              {matchedStudents.length > 0 ? (
                <div className="py-1">
                  <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-foreground/40">
                    Students
                  </p>
                  {matchedStudents.map((s, i) => (
                    <button
                      key={s.cod}
                      type="button"
                      role="option"
                      aria-selected={i === activeIndex}
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={() =>
                        goTo({
                          type: "student",
                          cod: s.cod,
                          label: s.nume,
                          sub: s.cod,
                        })
                      }
                      className={`flex w-full items-center justify-between px-3 py-2 text-left transition ${
                        i === activeIndex
                          ? "bg-accent/[0.08] text-accent"
                          : "text-foreground hover:bg-accent/[0.05]"
                      }`}
                    >
                      <span className="truncate font-medium">{s.nume}</span>
                      <span className="ml-2 shrink-0 text-xs text-foreground/40">
                        {s.cod}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}

              {matchedLectors.length > 0 ? (
                <div
                  className={
                    matchedStudents.length > 0
                      ? "border-t border-line py-1"
                      : "py-1"
                  }
                >
                  <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-foreground/40">
                    Lecturers
                  </p>
                  {matchedLectors.map((l, i) => {
                    const idx = matchedStudents.length + i;
                    return (
                      <button
                        key={l.username}
                        type="button"
                        role="option"
                        aria-selected={idx === activeIndex}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() =>
                          goTo({
                            type: "lector",
                            username: l.username,
                            label: l.name || l.username,
                            sub: l.username,
                          })
                        }
                        className={`flex w-full items-center justify-between px-3 py-2 text-left transition ${
                          idx === activeIndex
                            ? "bg-accent/[0.08] text-accent"
                            : "text-foreground hover:bg-accent/[0.05]"
                        }`}
                      >
                        <span className="truncate font-medium">
                          {l.name || l.username}
                        </span>
                        <span className="ml-2 shrink-0 text-xs text-foreground/40">
                          {l.username}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
