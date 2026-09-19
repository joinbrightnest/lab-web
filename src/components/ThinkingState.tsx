"use client";

import { useLayoutEffect, useRef, useState } from "react";

/* ─────────────────────────────────────────────────────────
 * THINKING STATE — expandable agent trace (Reasoning only)
 *
 * Controlled entirely by the parent: it decides when the
 * trace is `working` (fetch in flight) and when it's done
 * (and for how long it "thought"). No internal timers that
 * could get stuck if the parent takes longer than expected.
 *
 * Rows come from streamed reasoning (before ###) — never invent.
 * Do not show ### / GAND: / RASPUNS: labels.
 * ───────────────────────────────────────────────────────── */

export type ThinkingRow = { primary: string };

export type ThinkingStateProps = {
  /** true while the request is in flight; false once the reply arrived. */
  working: boolean;
  /** shown once `working` is false: "Thought for {durationSec}s". */
  durationSec?: number;
  /** Reasoning bullets from the model (phase 1); omit / empty → no inventing. */
  rows?: ThinkingRow[];
};

export default function ThinkingState({
  working,
  durationSec,
  rows,
}: ThinkingStateProps) {
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const expanded = manualExpanded ?? working;

  const effectiveRows = rows ?? [];

  const traceRef = useRef<HTMLDivElement>(null);
  const [lineHeight, setLineHeight] = useState(0);
  useLayoutEffect(() => {
    if (traceRef.current) setLineHeight(traceRef.current.offsetHeight);
  }, [expanded, working, effectiveRows.length]);

  const doneLabel =
    durationSec != null ? `Thought for ${durationSec}s` : "Thought";

  const hasTrace = effectiveRows.length > 0;

  return (
    <div className="flex w-full max-w-95 flex-col">
      {/* header */}
      <button
        type="button"
        aria-expanded={expanded}
        disabled={!hasTrace}
        onClick={() => {
          if (!hasTrace) return;
          setManualExpanded((current) => !(current ?? working));
        }}
        className="-mx-1.5 flex w-fit items-center gap-2 rounded-md px-1.5 py-1
          transition-colors duration-100 hover:bg-accent/[0.06] disabled:pointer-events-none"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill={working ? "var(--ink-2)" : "var(--ink-3)"}
        >
          <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
        </svg>
        <span role="status" className="contents">
          {working ? (
            <span
              className="bg-clip-text text-[13px] font-medium whitespace-nowrap text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, var(--ink-3) 35%, var(--ink) 50%, var(--ink-3) 65%)",
                backgroundSize: "200% 100%",
                animation: "shimmer-text 1.4s linear infinite",
              }}
            >
              Thinking
            </span>
          ) : (
            <span
              className="text-[13px] font-medium whitespace-nowrap text-ink-2"
              style={{ animation: "fade-in 350ms ease-out both" }}
            >
              {doneLabel}
            </span>
          )}
        </span>
        {hasTrace ? (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--ink-3)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-transform duration-300"
            style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)" }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        ) : null}
      </button>

      {/* expandable trace — reasoning rows only */}
      {hasTrace ? (
        <div
          className="grid transition-[grid-template-rows,opacity] duration-400"
          style={{
            gridTemplateRows: expanded ? "1fr" : "0fr",
            opacity: expanded ? 1 : 0,
            transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
          }}
        >
          <div className="overflow-hidden">
            <div className="relative mt-1 ml-[5px] pl-4">
              <span
                aria-hidden
                className="absolute left-[3px] w-px bg-line"
                style={{
                  top: -8,
                  height: lineHeight ? lineHeight - 2 : 0,
                  transition: "height 500ms cubic-bezier(0.23,1,0.32,1)",
                }}
              />
              <div ref={traceRef} className="flex flex-col gap-1 py-1">
                {effectiveRows.map((row, i) => (
                  <div
                    key={`${i}-${row.primary.slice(0, 48)}`}
                    className="flex min-h-7 w-full items-center gap-2 rounded-[6px] px-1.5 py-0.5 text-left"
                    style={{
                      animation: expanded
                        ? `fade-up 320ms cubic-bezier(0.23,1,0.32,1) ${i * 120}ms both`
                        : undefined,
                    }}
                  >
                    <span className="min-w-0 truncate text-[12.5px] whitespace-normal leading-relaxed text-ink-2">
                      {row.primary}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
