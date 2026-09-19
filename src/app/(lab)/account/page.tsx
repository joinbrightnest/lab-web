"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  apiFetch,
  authFetch,
  resolveMeEmail,
  type Me,
} from "@/lib/api";
import { goStudent } from "@/lib/student-paths";

export default function AccountPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState("");
  const [nextPw, setNextPw] = useState("");
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/me");
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (!res.ok) {
          setErr("Could not load account.");
          return;
        }
        const data = (await res.json()) as Me & { ok?: boolean };
        const role = (data.role || "").trim();
        if (role === "cursant") {
          goStudent("home", router);
          return;
        }
        if (role !== "admin" && role !== "lector") {
          router.replace("/login");
          return;
        }
        if (!cancelled) {
          setMe({
            id: data.id,
            username: data.username,
            name: data.name,
            role: data.role,
            email: data.email ?? resolveMeEmail(data),
          });
        }
      } catch {
        if (!cancelled) setErr("Could not load account.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function onPassword(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setErr("");
    setMsg("");
    try {
      const res = await authFetch("/password", {
        method: "POST",
        body: JSON.stringify({ current, new: nextPw }),
      });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setErr(body.error || "Could not change password.");
        return;
      }
      setMsg("Password updated.");
      setCurrent("");
      setNextPw("");
    } catch {
      setErr("Could not change password.");
    } finally {
      setPending(false);
    }
  }

  if (loading) {
    return (
      <main className="px-6 py-8 text-sm text-foreground/55">Loading…</main>
    );
  }

  if (!me) {
    return (
      <main className="px-6 py-8">
        <p className="text-sm text-red-800" role="alert">
          {err || "Account unavailable."}
        </p>
      </main>
    );
  }

  const email = resolveMeEmail(me);

  return (
    <main className="mx-auto w-full max-w-lg px-6 py-8">
      <h1
        className="text-2xl font-semibold tracking-tight text-foreground"
        style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}
      >
        Account
      </h1>
      <p className="mt-1 text-sm text-foreground/55">
        Profile and password for your Lab login.
      </p>

      <section className="mt-8 space-y-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-foreground/45">
            Name
          </p>
          <p className="mt-1 text-base font-medium text-foreground">
            {me.name?.trim() || me.username}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-foreground/45">
            Email
          </p>
          <p className="mt-1 text-base text-foreground/80">{email}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-foreground/45">
            Username
          </p>
          <p className="mt-1 text-sm tabular-nums text-foreground/70">
            {me.username}
          </p>
        </div>
      </section>

      <form onSubmit={onPassword} className="mt-10 flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground">Change password</h2>
        <label className="block text-xs font-medium text-foreground/60">
          Current password
          <input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-line bg-background px-2.5 py-2 text-sm outline-none ring-honey/40 focus:ring-2"
          />
        </label>
        <label className="block text-xs font-medium text-foreground/60">
          New password
          <input
            type="password"
            autoComplete="new-password"
            value={nextPw}
            onChange={(e) => setNextPw(e.target.value)}
            required
            minLength={6}
            className="mt-1 w-full rounded-md border border-line bg-background px-2.5 py-2 text-sm outline-none ring-honey/40 focus:ring-2"
          />
        </label>
        {err ? (
          <p className="text-xs text-red-800" role="alert">
            {err}
          </p>
        ) : null}
        {msg ? (
          <p className="text-xs text-accent" role="status">
            {msg}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending || !current || !nextPw}
          className="mt-1 rounded-md bg-accent px-3 py-2.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Update password"}
        </button>
      </form>
    </main>
  );
}
