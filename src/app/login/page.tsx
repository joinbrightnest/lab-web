"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { authLogin } from "@/lib/auth-login";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      // POST /lab/api/login (Caddy → Flask :5050). Never HTML /login.
      const result = await authLogin(username, password, "lab");
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.role === "admin") {
        router.push("/admin");
      } else {
        router.push("/calendar");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <p
          className="text-3xl font-semibold tracking-tight text-accent"
          style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}
        >
          BrightNest
        </p>
        <h1 className="mt-2 text-lg text-foreground/80">Lab sign in</h1>

        <form
          onSubmit={onSubmit}
          className="mt-10 flex flex-col gap-5 border-t border-line pt-8"
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-accent">User</span>
            <input
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="rounded-md border border-line bg-surface px-3 py-2.5 outline-none ring-honey/40 focus:ring-2"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-accent">Password</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="rounded-md border border-line bg-surface px-3 py-2.5 outline-none ring-honey/40 focus:ring-2"
            />
          </label>

          {error ? (
            <p className="text-sm font-medium text-red-800" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="mt-2 rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-[#F4EFE6] transition hover:brightness-110 disabled:opacity-60"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
