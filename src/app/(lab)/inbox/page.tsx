"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  apiFetch,
  type InboxCat,
  type InboxCounts,
  type InboxItem,
  type InboxPayload,
} from "@/lib/api";

const CATS: { key: InboxCat; label: string }[] = [
  { key: "toate", label: "All" },
  { key: "raspuns", label: "Reply" },
  { key: "fara_semnal", label: "No signal" },
  { key: "intarziat", label: "Overdue" },
];

const EMPTY_COUNTS: InboxCounts = {
  toate: 0,
  raspuns: 0,
  fara_semnal: 0,
  intarziat: 0,
};

export default function InboxPage() {
  const router = useRouter();
  const [cat, setCat] = useState<InboxCat>("toate");
  const [counts, setCounts] = useState<InboxCounts>(EMPTY_COUNTS);
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await apiFetch(`/inbox?cat=${encodeURIComponent(cat)}`);
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (res.status === 403) {
          if (!cancelled) {
            setError("Access denied.");
            setItems([]);
          }
          return;
        }
        if (!res.ok) {
          if (!cancelled) {
            setError("Could not load Inbox.");
            setItems([]);
          }
          return;
        }
        const data = (await res.json()) as InboxPayload;
        if (!cancelled) {
          setCounts(data.counts || EMPTY_COUNTS);
          setItems(Array.isArray(data.items) ? data.items : []);
          setError("");
        }
      } catch {
        if (!cancelled) {
          setError("Could not load Inbox.");
          setItems([]);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [cat, router]);

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden text-foreground">
      <aside className="flex w-[220px] shrink-0 flex-col border-r border-line">
        <div className="lab-utility-row flex shrink-0 items-center px-4">
          <h1
            className="text-base font-semibold text-accent"
            style={{ fontFamily: "var(--font-fraunces), serif" }}
          >
            Inbox
          </h1>
        </div>
        <nav className="flex flex-col gap-0.5 p-2 text-sm">
          {CATS.map(({ key, label }) => {
            const active = cat === key;
            const n = counts[key] ?? 0;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setCat(key)}
                className={
                  active
                    ? "flex items-center justify-between rounded-md bg-accent/[0.12] px-2.5 py-2 font-medium text-accent"
                    : "flex items-center justify-between rounded-md px-2.5 py-2 text-foreground/70 hover:bg-accent/[0.06] hover:text-accent"
                }
              >
                <span>{label}</span>
                <span className="tabular-nums text-foreground/45">{n}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="lab-utility-row flex shrink-0 items-center px-5">
          <p className="text-sm text-foreground/55">
            Work queue — who to reach and why.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error ? (
            <p className="text-sm text-red-800">{error}</p>
          ) : items === null ? (
            <p className="text-sm text-foreground/45">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-foreground/55">Nothing to do.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {items.map((it) => {
                const preview =
                  (it.update_preview || "").trim() ||
                  (it.mission_preview || "").trim();
                return (
                  <li key={`${it.cat}-${it.cod}`}>
                    <Link
                      href={`/dosar/${encodeURIComponent(it.cod)}?tab=activitate`}
                      className="block rounded-md px-3 py-2.5 outline-none transition hover:bg-accent/[0.06] focus-visible:ring-2 focus-visible:ring-honey/40"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm">
                            <span className="font-medium text-foreground">
                              {it.nume}
                            </span>
                            <span className="ml-2 text-foreground/45">
                              {it.cod}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
                            {it.why}
                          </p>
                          {preview ? (
                            <p className="mt-0.5 truncate text-sm text-foreground/55">
                              {preview}
                            </p>
                          ) : null}
                        </div>
                        <time className="shrink-0 text-xs tabular-nums text-foreground/45">
                          {it.when}
                        </time>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
