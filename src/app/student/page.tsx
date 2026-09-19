"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrightNestMark } from "@/components/BrightNestMark";
import { StudentBookCall } from "@/components/StudentBookCall";
import { UserMenuDropdown } from "@/components/UserMenuDropdown";
import { type StudentHome, type StudentCall } from "@/lib/api";
import { goStudent } from "@/lib/student-paths";

/** Caddy → Flask :5050. Never fetch("/") or "/student" as JSON. */
const STUDENT_ME_URL = "/lab/api/student-me";
const EMPTY_MISIUNE = "Your lecturer is preparing the mission.";

function isJsonResponse(res: Response): boolean {
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  return ct.includes("application/json");
}

function misiuneTextOf(
  misiune: StudentHome["misiune"],
): string | null {
  if (misiune == null) return null;
  if (typeof misiune === "string") return misiune.trim() || null;
  return (misiune.text || "").trim() || null;
}

function prenumeFromNume(nume: string): string {
  const first = (nume || "").trim().split(/\s+/)[0];
  return first || nume;
}

function renderInlineMarkdown(text: string): ReactNode {
  const parts: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index).replace(/\*+/g, ""));
    }
    parts.push(<strong key={key++}>{match[1].replace(/\*+/g, "")}</strong>);
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    parts.push(text.slice(last).replace(/\*+/g, ""));
  }
  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

type MisiuneSection = { title: string; body: string };

function parseMisiuneSections(raw: string): MisiuneSection[] | null {
  const labelRe =
    /^[\s#*]*?(FAPTE|MISIUNE|DE\s+CE)\b[\s#*]*:?[\s#*]*(.*)$/i;
  const sections: Record<string, string[]> = {
    FAPTE: [],
    MISIUNE: [],
    "DE CE": [],
  };
  const titles: Record<string, string> = {
    FAPTE: "Fapte",
    MISIUNE: "Misiune",
    "DE CE": "De ce",
  };
  let current: string | null = null;
  let found = false;

  for (const line of raw.split("\n")) {
    const lm = line.match(labelRe);
    if (lm) {
      let key = lm[1].toUpperCase();
      if (key.startsWith("DE")) key = "DE CE";
      current = key;
      found = true;
      const rest = lm[2].trim();
      if (rest) sections[key].push(rest);
      continue;
    }
    if (current && current in sections) {
      sections[current].push(line);
    }
  }

  if (!found) return null;

  const order = ["FAPTE", "MISIUNE", "DE CE"] as const;
  const out: MisiuneSection[] = [];
  for (const key of order) {
    const body = sections[key].join("\n").trim();
    if (body) out.push({ title: titles[key], body });
  }
  return out.length ? out : null;
}

function MisiuneBody({ text }: { text: string }) {
  const sections = parseMisiuneSections(text);
  if (!sections) {
    return (
      <p className="mt-2 whitespace-pre-wrap text-base leading-relaxed">
        {renderInlineMarkdown(text.trim())}
      </p>
    );
  }
  return (
    <div className="mt-2 flex flex-col gap-4">
      {sections.map((s) => (
        <div key={s.title}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-honey">
            {s.title}
          </h3>
          <p className="mt-1 whitespace-pre-wrap text-base leading-relaxed">
            {renderInlineMarkdown(s.body)}
          </p>
        </div>
      ))}
    </div>
  );
}

async function errorDetail(res: Response): Promise<string> {
  const raw = await res.text();
  const body = raw.trim() || "(empty body)";
  return `${res.status} ${body}`;
}

function StudentHeader() {
  return (
    <header className="flex items-center justify-between border-b border-line pb-4">
      <div className="flex items-center gap-2.5">
        <BrightNestMark size={36} className="h-9 w-auto object-contain" />
        <span
          className="text-xl font-semibold text-accent"
          style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}
        >
          BrightNest
        </span>
      </div>
      <UserMenuDropdown
        compactOnMobile
        menuPlacement="down"
        align="right"
      />
    </header>
  );
}

export default function StudentHomePage() {
  const router = useRouter();
  const [home, setHome] = useState<StudentHome | null>(null);
  const [loading, setLoading] = useState(true);
  const [staffBlocked, setStaffBlocked] = useState(false);
  const [nota, setNota] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const loadHome = useCallback(async () => {
    const res = await fetch(STUDENT_ME_URL, { credentials: "include" });
    if (res.status === 401) {
      goStudent("login", router);
      return null;
    }
    if (!isJsonResponse(res)) {
      setError(
        `${res.status} not JSON (${res.headers.get("content-type") || "no content-type"})`,
      );
      setHome(null);
      return null;
    }
    type StudentMeJson = {
      ok?: boolean;
      error?: string;
      name?: string;
      nume?: string;
      cod?: string;
      misiune?: StudentHome["misiune"];
      materiale?: string;
      upcoming?: StudentCall[];
    };
    let data: StudentMeJson;
    try {
      data = (await res.json()) as StudentMeJson;
    } catch {
      setError(`${res.status} invalid JSON`);
      setHome(null);
      return null;
    }
    if (!res.ok || data.ok === false) {
      const errMsg = String(data.error || "");
      if (errMsg === "Forbidden") {
        setStaffBlocked(true);
        setHome(null);
        setError(errMsg);
        return null;
      }
      setError(errMsg || `Error ${res.status}`);
      setHome(null);
      return null;
    }
    const normalized: StudentHome = {
      name: String(data.name || data.nume || ""),
      nume: data.nume,
      cod: String(data.cod || ""),
      misiune: data.misiune ?? null,
      materiale: String(data.materiale || ""),
      upcoming: Array.isArray(data.upcoming) ? data.upcoming : [],
    };
    setStaffBlocked(false);
    setHome(normalized);
    setError("");
    return normalized;
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadHome();
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? `network ${e.message}` : "network error",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadHome]);

  async function onProgres(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaved(false);
    setSaving(true);
    try {
      const res = await fetch("/lab/api/student/progres", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nota: nota.slice(0, 300) }),
      });
      if (res.status === 401) {
        goStudent("login", router);
        return;
      }
      if (!res.ok) {
        setError(await errorDetail(res));
        return;
      }
      setNota("");
      setSaved(true);
      await loadHome();
    } catch (err) {
      setError(
        err instanceof Error ? `network ${err.message}` : "Could not save note.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-16 text-foreground/60">
        Loading…
      </main>
    );
  }

  if (staffBlocked) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-10">
        <StudentHeader />
        <p className="text-base leading-relaxed text-foreground/80">
          You are signed in as staff. The student portal is separate.
        </p>
        {error ? (
          <p className="text-sm font-medium text-red-800" role="alert">
            {error}
          </p>
        ) : null}
        <Link
          href="/login"
          className="text-sm font-medium text-accent underline-offset-2 hover:underline"
        >
          Go to Lab login
        </Link>
      </main>
    );
  }

  if (!home) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-10">
        <StudentHeader />
        <p className="break-all text-sm font-medium text-red-800" role="alert">
          {error || "Unassigned account."}
        </p>
      </main>
    );
  }

  const prenume = prenumeFromNume(home.name || home.nume || "");
  const misiuneText = misiuneTextOf(home.misiune);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-7 px-4 py-10">
      <StudentHeader />

      <section>
        <h1
          className="text-3xl font-semibold tracking-tight text-accent"
          style={{ fontFamily: "var(--font-fraunces), Georgia, serif" }}
        >
          {prenume}
        </h1>
        {home.cod ? (
          <p className="mt-1 text-sm text-foreground/50">{home.cod}</p>
        ) : null}
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-honey">
          Your mission
        </h2>
        {misiuneText ? (
          <MisiuneBody text={misiuneText} />
        ) : (
          <p className="mt-2 text-base leading-relaxed text-foreground/70">
            {EMPTY_MISIUNE}
          </p>
        )}
      </section>

      <StudentBookCall
        initialUpcoming={home.upcoming || []}
        onUnauthorized={() => goStudent("login", router)}
      />

      {(home.materiale || "").trim() ? (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-honey">
            Materials
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
            {home.materiale.trim()}
          </p>
        </section>
      ) : null}

      <form onSubmit={onProgres} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-accent">Note (max 300)</span>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value.slice(0, 300))}
            maxLength={300}
            rows={3}
            placeholder="What did you do?"
            className="rounded-md border border-line bg-surface px-3 py-2.5 outline-none ring-honey/40 focus:ring-2"
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-[#F4EFE6] transition hover:brightness-110 disabled:opacity-60"
          >
            {saving ? "Saving…" : "I did it"}
          </button>
          <span className="text-xs text-foreground/50">{nota.length}/300</span>
        </div>
        {saved ? (
          <p className="text-sm font-medium text-accent">Saved, thank you.</p>
        ) : null}
        {error ? (
          <p className="break-all text-sm font-medium text-red-800" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </main>
  );
}
