"use client";

import {
  FormEvent,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

const TIPURI = ["Lacună", "Progres", "Observație"] as const;

type OpenOptions = {
  onSaved?: () => void;
};

type UpdateModalContextValue = {
  openUpdate: (cod: string | null | undefined, opts?: OpenOptions) => void;
  closeUpdate: () => void;
  toast: (message: string) => void;
};

const UpdateModalContext = createContext<UpdateModalContextValue | null>(null);

export function useUpdateModal() {
  const ctx = useContext(UpdateModalContext);
  if (!ctx) {
    throw new Error("useUpdateModal must be used within UpdateModalProvider");
  }
  return ctx;
}

function ToastHost({
  message,
  onDone,
}: {
  message: string | null;
  onDone: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(onDone, 2800);
    return () => window.clearTimeout(t);
  }, [message, onDone]);

  if (!message) return null;

  return (
    <div
      role="status"
      className="pointer-events-none fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-md border border-line bg-surface px-4 py-2.5 text-sm font-medium text-foreground shadow-[0_8px_24px_rgba(44,95,69,0.12)]"
      style={{ animation: "fade-up 180ms ease-out" }}
    >
      {message}
    </div>
  );
}

function UpdateFormModal({
  cod,
  onClose,
  onSaved,
}: {
  cod: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<string>(TIPURI[0]);
  const [nivel, setNivel] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const el = panelRef.current?.querySelector<HTMLElement>("select, input, textarea");
    el?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      const res = await apiFetch("/update", {
        method: "POST",
        body: JSON.stringify({ cod, tip, nivel, feedback }),
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        setError("Could not save update.");
        return;
      }
      onSaved?.();
      onClose();
    } catch {
      setError("Could not save update.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-[color-mix(in_srgb,var(--foreground)_28%,transparent)]"
        onClick={() => {
          if (!pending) onClose();
        }}
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
            Update
          </h2>
          <p className="mt-1 text-sm text-foreground/60">
            Cod: <span className="font-medium text-foreground">{cod}</span>
          </p>
        </header>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-accent">Tip</span>
            <select
              name="tip"
              value={tip}
              onChange={(e) => setTip(e.target.value)}
              required
              className="rounded-md border border-line bg-surface px-3 py-2.5 outline-none ring-honey/40 focus:ring-2"
            >
              {TIPURI.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-accent">Nivel</span>
            <input
              name="nivel"
              value={nivel}
              onChange={(e) => setNivel(e.target.value)}
              required
              className="rounded-md border border-line bg-surface px-3 py-2.5 outline-none ring-honey/40 focus:ring-2"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-accent">Feedback</span>
            <textarea
              name="feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              required
              rows={4}
              className="resize-y rounded-md border border-line bg-surface px-3 py-2.5 outline-none ring-honey/40 focus:ring-2"
            />
          </label>

          {error ? (
            <p className="text-sm font-medium text-red-800" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-[#F4EFE6] transition hover:brightness-110 disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={onClose}
              className="text-sm text-foreground/65 underline-offset-2 hover:text-foreground hover:underline disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function UpdateModalProvider({ children }: { children: ReactNode }) {
  const [cod, setCod] = useState<string | null>(null);
  const [onSaved, setOnSaved] = useState<(() => void) | undefined>();
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const clearToast = useCallback(() => setToastMsg(null), []);

  const toast = useCallback((message: string) => {
    setToastMsg(message);
  }, []);

  const closeUpdate = useCallback(() => {
    setCod(null);
    setOnSaved(undefined);
  }, []);

  const openUpdate = useCallback(
    (raw: string | null | undefined, opts?: OpenOptions) => {
      const next = (raw || "").trim();
      if (!next) {
        toast("Alege un cursant");
        return;
      }
      setOnSaved(() => opts?.onSaved);
      setCod(next);
    },
    [toast],
  );

  const value: UpdateModalContextValue = {
    openUpdate,
    closeUpdate,
    toast,
  };

  return (
    <UpdateModalContext.Provider value={value}>
      {children}
      {cod ? (
        <UpdateFormModal
          cod={cod}
          onClose={closeUpdate}
          onSaved={onSaved}
        />
      ) : null}
      <ToastHost message={toastMsg} onDone={clearToast} />
    </UpdateModalContext.Provider>
  );
}
