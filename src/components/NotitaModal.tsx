"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import type { NotitaRow } from "@/lib/api";

function noteDateLabel(raw: string | null | undefined) {
  const t = (raw || "").trim();
  return t.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || t || "—";
}

export type NotitaModalMode =
  | { kind: "new" }
  | { kind: "view"; note: NotitaRow };

type NotitaModalProps = {
  mode: NotitaModalMode;
  pending?: boolean;
  error?: string;
  onClose: () => void;
  onSave: (payload: { textul: string; reminder_la?: string }) => void;
  onDelete?: () => void;
};

export function NotitaModal({
  mode,
  pending = false,
  error = "",
  onClose,
  onSave,
  onDelete,
}: NotitaModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [textul, setTextul] = useState("");
  const [reminderLa, setReminderLa] = useState("");

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (mode.kind === "new") {
      const el = panelRef.current?.querySelector<HTMLElement>("textarea");
      el?.focus();
    }
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mode.kind]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  function closeIfIdle() {
    if (!pending) onClose();
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const t = textul.trim();
    if (!t || pending) return;
    const rem = reminderLa.trim();
    onSave(rem ? { textul: t, reminder_la: rem } : { textul: t });
  }

  const viewNote = mode.kind === "view" ? mode.note : null;
  const remView = (viewNote?.reminder_la || "").trim();

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Închide"
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--foreground)_28%,transparent)]"
        onClick={closeIfIdle}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-[1] w-full max-w-[480px] rounded-[18px] border border-[#C9C0B2] bg-[#F4EFE6] p-5 shadow-[0_12px_40px_rgba(44,95,69,0.14)] sm:p-6"
        style={{ animation: "fade-up 160ms ease-out" }}
      >
        <header className="mb-5 border-b border-line pb-3">
          <h2
            id={titleId}
            className="text-xl font-semibold text-accent"
            style={{ fontFamily: "var(--font-fraunces), serif" }}
          >
            Note
          </h2>
          {viewNote ? (
            <p className="mt-1 text-sm text-foreground/60 tabular-nums">
              {noteDateLabel(viewNote.creat_la)}
              {viewNote.de_catre ? ` · ${viewNote.de_catre}` : ""}
            </p>
          ) : null}
        </header>

        {mode.kind === "new" ? (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="sr-only">Text notă</span>
              <textarea
                value={textul}
                onChange={(e) => setTextul(e.target.value)}
                required
                rows={8}
                placeholder="Write a note…"
                className="resize-y rounded-md border border-line bg-surface px-3 py-2.5 text-sm leading-relaxed outline-none ring-honey/40 focus:ring-2"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-accent">Reminder (opțional)</span>
              <input
                type="date"
                value={reminderLa}
                onChange={(e) => setReminderLa(e.target.value)}
                className="rounded-md border border-line bg-surface px-3 py-2.5 outline-none ring-honey/40 focus:ring-2"
              />
            </label>

            {error ? (
              <p className="text-sm font-medium text-red-800" role="alert">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                disabled={pending}
                onClick={closeIfIdle}
                className="rounded-md border border-line bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-background disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending || !textul.trim()}
                className="rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-[#F4EFE6] transition hover:brightness-110 disabled:opacity-60"
              >
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {(viewNote?.textul || "").trim() || "—"}
            </p>
            {remView ? (
              <p className="text-sm text-foreground/65">
                Reminder:{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {remView}
                </span>
              </p>
            ) : null}

            {error ? (
              <p className="text-sm font-medium text-red-800" role="alert">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
              <button
                type="button"
                disabled={pending}
                onClick={closeIfIdle}
                className="rounded-md border border-line bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-background disabled:opacity-60"
              >
                Închide
              </button>
              {onDelete ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={onDelete}
                  className="text-sm font-medium text-red-800 underline-offset-2 hover:underline disabled:opacity-60"
                >
                  Delete
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
