"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, type Setari } from "@/lib/api";

export default function SetariPage() {
  const router = useRouter();
  const [ritm, setRitm] = useState("");
  const [promptChat, setPromptChat] = useState("");
  const [promptMisiune, setPromptMisiune] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await apiFetch("/setari");
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (res.status === 403) {
          router.replace("/cursanti");
          return;
        }
        if (!res.ok) {
          if (!cancelled) setError("Could not load settings.");
          return;
        }
        const json = (await res.json()) as Setari;
        if (!cancelled) {
          setRitm(json.ritm_zile_implicit ?? "");
          setPromptChat(json.prompt_chat ?? "");
          setPromptMisiune(json.prompt_misiune ?? "");
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setError("Could not load settings.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError("");
    setOkMsg("");
    setPending(true);
    try {
      const res = await apiFetch("/setari", {
        method: "POST",
        body: JSON.stringify({
          ritm_zile_implicit: ritm,
          prompt_chat: promptChat,
          prompt_misiune: promptMisiune,
        }),
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        setError("Could not save settings.");
        return;
      }
      setOkMsg("Saved.");
    } catch {
      setError("Could not save settings.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <header className="lab-utility-row flex shrink-0 items-center px-4 sm:px-6">
        <h1
          className="text-sm font-semibold text-accent"
          style={{ fontFamily: "var(--font-fraunces), serif" }}
        >
          Settings
        </h1>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6 sm:px-6">
      {error ? (
        <p className="mb-4 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      {!loaded && !error ? (
        <p className="text-sm text-foreground/60">Loading…</p>
      ) : null}

      {loaded ? (
        <form onSubmit={onSubmit} className="flex flex-col gap-8">
          <section>
            <h2
              className="mb-3 text-lg font-semibold text-accent"
              style={{ fontFamily: "var(--font-fraunces), serif" }}
            >
              Default mission rhythm
            </h2>
            <label className="mb-1.5 block text-sm text-foreground/70">
              Default mission rhythm (days)
            </label>
            <input
              type="text"
              value={ritm}
              onChange={(e) => setRitm(e.target.value)}
              className="w-full max-w-[12rem] rounded-md border border-line bg-surface px-3 py-2.5 text-sm text-foreground outline-none ring-honey/40 focus:ring-2"
            />
          </section>

          <div className="grid gap-8 md:grid-cols-2">
            <section>
              <h2
                className="mb-3 text-lg font-semibold text-accent"
                style={{ fontFamily: "var(--font-fraunces), serif" }}
              >
                Prompt chat
              </h2>
              <label className="mb-1.5 block text-sm text-foreground/70">
                Assistant prompt
              </label>
              <textarea
                rows={12}
                value={promptChat}
                onChange={(e) => setPromptChat(e.target.value)}
                className="w-full resize-y rounded-md border border-line bg-surface px-3 py-2.5 font-mono text-xs leading-relaxed text-foreground outline-none ring-honey/40 focus:ring-2"
              />
            </section>

            <section>
              <h2
                className="mb-3 text-lg font-semibold text-accent"
                style={{ fontFamily: "var(--font-fraunces), serif" }}
              >
                Prompt misiune
              </h2>
              <label className="mb-1.5 block text-sm text-foreground/70">
                Mission generation prompt
              </label>
              <textarea
                rows={12}
                value={promptMisiune}
                onChange={(e) => setPromptMisiune(e.target.value)}
                className="w-full resize-y rounded-md border border-line bg-surface px-3 py-2.5 font-mono text-xs leading-relaxed text-foreground outline-none ring-honey/40 focus:ring-2"
              />
            </section>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-[#F4EFE6] transition hover:brightness-110 disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            {okMsg ? (
              <p className="text-sm font-medium text-accent" role="status">
                {okMsg}
              </p>
            ) : null}
          </div>
        </form>
      ) : null}
      </main>
      </div>
    </>
  );
}
