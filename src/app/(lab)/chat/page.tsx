"use client";

import {
  FormEvent,
  type ReactNode,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import {
  apiFetch,
  type Cursant,
  type LabChatSources,
  type Mesaj,
  type MesajePayload,
} from "@/lib/api";
import ThinkingState from "@/components/ThinkingState";
import { useLabChat } from "@/components/LabChatContext";
import { useUpdateModal } from "@/components/UpdateModal";

type MesajCuGandire = Mesaj & {
  thinking?: {
    durationSec?: number;
    bullets?: string[];
  };
  sources?: LabChatSources | null;
};

/** Exact separator line between reasoning and reply (never shown in UI). */
const SEP_LINE_RE = /^###\s*$/m;
/** Legacy markers — strip if present, never display. */
const GAND_LINE_RE = /^GAND:\s*$/im;
const RASPUNS_LINE_RE = /^RASPUNS:\s*$/im;

function bulletsFromBlock(block: string, allowPartialLast: boolean): string[] | null {
  const cleaned = block
    .replace(/\r\n/g, "\n")
    .replace(GAND_LINE_RE, "")
    .replace(RASPUNS_LINE_RE, "")
    .replace(SEP_LINE_RE, "");
  const lines = cleaned.replace(/^\n/, "").split("\n");
  const usable =
    allowPartialLast || cleaned.endsWith("\n") ? lines : lines.slice(0, -1);
  const bullets = usable
    .map((line) => line.replace(/^[-•*]\s+/, "").trim())
    .filter((line) => {
      if (!line) return false;
      const up = line.toUpperCase();
      if (up === "GAND:" || up === "RASPUNS:" || line === "###") return false;
      return true;
    });
  return bullets.length > 0 ? bullets : null;
}

function stripPhaseLabels(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(GAND_LINE_RE, "")
    .replace(RASPUNS_LINE_RE, "")
    .replace(SEP_LINE_RE, "")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");
}

/** Final split — ### (or legacy GAND/RASPUNS). Never leave labels in either zone. */
function parseTwoPhase(raw: string): {
  bullets: string[] | null;
  reply: string;
} {
  const text = (raw || "").replace(/\r\n/g, "\n").trim();
  if (!text) return { bullets: null, reply: "" };

  const sepM = SEP_LINE_RE.exec(text);
  if (sepM) {
    const reasoning = text.slice(0, sepM.index).trim();
    const reply = stripPhaseLabels(
      text.slice(sepM.index! + sepM[0].length).replace(/^\n/, ""),
    );
    return {
      bullets: bulletsFromBlock(reasoning + "\n", true),
      reply,
    };
  }

  // Legacy GAND / RASPUNS
  const gandM = GAND_LINE_RE.exec(text);
  if (gandM) {
    const afterGand = text.slice(gandM.index! + gandM[0].length);
    const raspunsM = RASPUNS_LINE_RE.exec(afterGand);
    if (!raspunsM) {
      return {
        bullets: bulletsFromBlock(afterGand.trim(), true),
        reply: "",
      };
    }
    const gandBlock = afterGand.slice(0, raspunsM.index).trim();
    const reply = stripPhaseLabels(
      afterGand.slice(raspunsM.index! + raspunsM[0].length),
    );
    return {
      bullets: bulletsFromBlock(gandBlock + "\n", true),
      reply,
    };
  }

  // No separator at done → whole text is the reply (no reasoning zone).
  return { bullets: null, reply: stripPhaseLabels(text) || text };
}

/**
 * Incremental parse on accumulated SSE text.
 * Phase 1 (before ###): reasoning → „A gândit” only; bubble empty.
 * Phase 2 (after ###): reply → bubble only; freeze reasoning.
 */
function parseTwoPhaseIncremental(raw: string): {
  bullets: string[] | null;
  reply: string;
  inReasoning: boolean;
  inReply: boolean;
} {
  const text = (raw || "").replace(/\r\n/g, "\n");
  if (!text) {
    return {
      bullets: null,
      reply: "",
      inReasoning: false,
      inReply: false,
    };
  }

  const sepM = SEP_LINE_RE.exec(text);
  if (!sepM) {
    // Hold a partial "###" being typed on the last line — keep out of reasoning.
    const lines = text.split("\n");
    const last = (lines[lines.length - 1] ?? "").trim();
    if (last.length > 0 && last.length <= 3 && "###".startsWith(last)) {
      const withoutPartial = lines.slice(0, -1).join("\n");
      return {
        bullets: bulletsFromBlock(withoutPartial, true),
        reply: "",
        inReasoning: true,
        inReply: false,
      };
    }
    return {
      bullets: bulletsFromBlock(text, true),
      reply: "",
      inReasoning: true,
      inReply: false,
    };
  }

  const reasoning = text.slice(0, sepM.index);
  const reply = text
    .slice(sepM.index! + sepM[0].length)
    .replace(/^\n/, "")
    .replace(GAND_LINE_RE, "")
    .replace(RASPUNS_LINE_RE, "");
  return {
    bullets: bulletsFromBlock(reasoning.trimEnd() + "\n", true),
    reply,
    inReasoning: false,
    inReply: true,
  };
}

function sourceChips(sources?: LabChatSources | null): string[] {
  if (!sources?.cod) return [];
  const chips = [sources.cod];
  chips.push(sources.misiune ? "misiune: da" : "misiune: nu");
  if (sources.ultimul_update) {
    chips.push(`update: ${sources.ultimul_update}`);
  }
  return chips;
}

/** Render plain text with **bold** and newlines — no StreamingText / sources. */
function ChatText({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(...splitNewlines(text.slice(last, m.index), key));
      key += 1;
    }
    nodes.push(<strong key={`b${key++}`}>{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    nodes.push(...splitNewlines(text.slice(last), key));
  }
  return <>{nodes}</>;
}

function splitNewlines(chunk: string, keyBase: number): ReactNode[] {
  const parts = chunk.split("\n");
  const out: ReactNode[] = [];
  parts.forEach((part, i) => {
    if (i > 0) out.push(<br key={`n${keyBase}-${i}`} />);
    if (part) out.push(<span key={`t${keyBase}-${i}`}>{part}</span>);
  });
  return out;
}

type StreamDone = {
  done?: boolean;
  c?: number;
  cod?: string | null;
  cursant_cod?: string | null;
  t?: string;
  error?: string;
  sources?: LabChatSources | null;
};

type StreamConsumeResult = {
  meta: StreamDone;
  hadText: boolean;
  error?: string;
  rawPreview: string;
  firstEvent: { raw: string; parsed: unknown } | null;
};

async function consumeChatStream(
  res: Response,
  onText: (chunk: string) => void,
): Promise<StreamConsumeResult> {
  if (!res.body) throw new Error("no body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let meta: StreamDone = {};
  let hadText = false;
  let streamError = "";
  let rawPreview = "";
  let loggedPreview = false;
  let firstEvent: { raw: string; parsed: unknown } | null = null;

  function logPreview(force = false) {
    if (loggedPreview) return;
    if (!force && rawPreview.length < 300) return;
    loggedPreview = true;
    console.log("[chat-api]", res.status, rawPreview.slice(0, 300));
  }

  function handleDataLine(payload: string) {
    if (!payload || payload === "[DONE]") return;

    let data: StreamDone;
    try {
      data = JSON.parse(payload) as StreamDone;
    } catch {
      if (!firstEvent) {
        firstEvent = { raw: payload, parsed: null };
        console.log(
          "[chat-api] first SSE payload (JSON parse failed):",
          payload.slice(0, 300),
        );
      }
      return;
    }

    if (!firstEvent) {
      firstEvent = { raw: payload, parsed: data };
      console.log("[chat-api] first SSE event parsed:", data);
    }

    if (typeof data.error === "string" && data.error) {
      streamError = data.error;
    }
    // Append on every {"t": "..."} — never wait for done.
    if (typeof data.t === "string" && data.t.length > 0) {
      hadText = true;
      onText(data.t);
    }
    if (data.done) {
      meta = { ...meta, ...data };
    }
  }

  /** Fire each data: line as soon as its \\n arrives — do not wait for blank line / done. */
  function drainLines() {
    buffer = buffer.replace(/\r\n/g, "\n");
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trimEnd();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      if (!line.startsWith("data:")) continue;
      const payload = line.startsWith("data: ")
        ? line.slice(6)
        : line.slice(5).trim();
      handleDataLine(payload.trim());
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (rawPreview.length < 300) {
      rawPreview += chunk;
    }
    logPreview();
    buffer += chunk;
    drainLines();
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    // Final unterminated line
    const line = buffer.trimEnd();
    buffer = "";
    if (line.startsWith("data:")) {
      const payload = line.startsWith("data: ")
        ? line.slice(6)
        : line.slice(5).trim();
      handleDataLine(payload.trim());
    }
  }
  logPreview(true);

  if (!firstEvent) {
    console.log("[chat-api] no data: events in body");
  }

  return {
    meta,
    hadText,
    error: streamError || undefined,
    rawPreview,
    firstEvent,
  };
}

type StreamDraft = {
  raw: string;
  bullets: string[] | null;
  reply: string;
  inReasoning: boolean;
  inReply: boolean;
};

function ChatPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const codParam = useMemo(
    () => (searchParams.get("cod") || "").trim(),
    [searchParams],
  );
  const streamRef = useRef<HTMLDivElement>(null);
  const {
    activeId,
    selectionEpoch,
    threads,
    adoptThread,
    refreshThreads,
  } = useLabChat();
  const { openUpdate } = useUpdateModal();

  const [messages, setMessages] = useState<MesajCuGandire[]>([]);
  const pendingStartRef = useRef<number | null>(null);
  const [messagesError, setMessagesError] = useState("");
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [cursanti, setCursanti] = useState<Cursant[]>([]);
  /** Per-thread cursant — never global localStorage. */
  const [cod, setCod] = useState("");

  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [thinkingWorking, setThinkingWorking] = useState(false);
  const [streamDraft, setStreamDraft] = useState<StreamDraft | null>(null);
  const [sendError, setSendError] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);

  function resizeComposer() {
    const el = composerRef.current;
    if (!el) return;
    const line = 22;
    const max = line * 4;
    el.style.height = "auto";
    const next = Math.min(Math.max(el.scrollHeight, line), max);
    el.style.height = `${next}px`;
    el.style.overflowY = next > line ? "auto" : "hidden";
  }

  async function handle401(res: Response) {
    if (res.status === 401) {
      router.replace("/login");
      return true;
    }
    return false;
  }

  async function persistThreadCod(cid: number, nextCod: string) {
    try {
      const res = await apiFetch("/chat-cod", {
        method: "POST",
        body: JSON.stringify({ c: cid, cod: nextCod || null }),
      });
      if (await handle401(res)) return;
      if (res.ok) await refreshThreads();
    } catch {
      // non-blocking
    }
  }

  async function onCodChange(next: string) {
    setCod(next);
    if (activeId != null) {
      void persistThreadCod(activeId, next);
    }
  }

  async function loadMessages(cid: number) {
    setLoadingMessages(true);
    setMessagesError("");
    try {
      const res = await apiFetch(`/mesaje?c=${encodeURIComponent(String(cid))}`);
      if (await handle401(res)) return;
      if (!res.ok) {
        setMessagesError("Could not load messages.");
        setMessages([]);
        return;
      }
      const data = (await res.json()) as MesajePayload | Mesaj[];
      // Support both new { mesaje, cursant_cod } and legacy array.
      if (Array.isArray(data)) {
        setMessages(data);
        const fromList = threads?.find((t) => t.id === cid)?.cursant_cod;
        setCod((fromList || "").trim());
      } else {
        setMessages(data.mesaje || []);
        setCod((data.cursant_cod || "").trim());
      }
    } catch {
      setMessagesError("Could not load messages.");
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const cursRes = await apiFetch("/cursanti");
        if (cursRes.status === 401) {
          router.replace("/login");
          return;
        }
        if (cursRes.ok) {
          const rows = (await cursRes.json()) as Cursant[];
          if (!cancelled) setCursanti(rows);
        }
      } catch {
        // cursanti optional for composer picker
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    setSendError("");
    setStreamDraft(null);
    if (activeId == null) {
      setMessages([]);
      setMessagesError("");
      setCod("");
      return;
    }
    // Prefill from thread list while mesaje loads (covers ?c= URL case).
    const fromList = threads?.find((t) => t.id === activeId)?.cursant_cod;
    setCod((fromList || "").trim());
    void loadMessages(activeId);
    // Only user-driven selection (epoch), not adoptThread after send.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionEpoch]);

  useEffect(() => {
    if (!codParam) return;
    // Prefill only for a new chat (no active thread).
    if (activeId != null) {
      router.replace("/chat");
      return;
    }
    setCod(codParam);
    router.replace("/chat");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codParam]);

  useEffect(() => {
    const el = streamRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, pending, thinkingWorking, streamDraft]);

  useEffect(() => {
    resizeComposer();
  }, [draft]);

  function markThinkingDone(bullets?: string[] | null) {
    const durationSec = Math.max(
      1,
      Math.round((Date.now() - (pendingStartRef.current ?? Date.now())) / 1000),
    );
    setThinkingWorking(false);
    return {
      durationSec,
      ...(bullets && bullets.length > 0 ? { bullets } : {}),
    };
  }

  function pushAiReply(raw: string, sources?: LabChatSources | null) {
    const { bullets, reply } = parseTwoPhase(raw);
    const thinking = markThinkingDone(bullets);
    const text =
      (reply || (!bullets ? raw.trim() : "") || "(no reply)").trim() ||
      "(no reply)";
    // Same tick: promote stream → message so the white bubble never unmounts empty.
    flushSync(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          text,
          thinking: bullets ? thinking : undefined,
          sources: sources ?? null,
        },
      ]);
      setStreamDraft(null);
    });
  }

  function applyStreamChunk(full: string) {
    const parsed = parseTwoPhaseIncremental(full);
    flushSync(() => {
      setStreamDraft({
        raw: full,
        bullets: parsed.bullets,
        reply: parsed.reply,
        inReasoning: parsed.inReasoning,
        inReply: parsed.inReply,
      });
      // Phase 2: freeze „A gândit”; stop shimmer.
      if (parsed.inReply) {
        setThinkingWorking(false);
      }
    });
  }

  async function onSend() {
    const q = draft.trim();
    if (!q || pending) return;

    if (!cod.trim()) {
      setSendError("Alege un cursant sus");
      return;
    }

    setSendError("");
    setPending(true);
    setThinkingWorking(true);
    setStreamDraft(null);
    setDraft("");
    pendingStartRef.current = Date.now();

    const optimistic: Mesaj = { role: "user", text: q };
    setMessages((prev) => [...prev, optimistic]);

    const body: { q: string; c?: number; cod?: string } = { q };
    if (activeId != null) body.c = activeId;
    if (cod) body.cod = cod;

    try {
      // SSE only — never await res.json() for the AI message body.
      const streamRes = await apiFetch("/chat-api", {
        method: "POST",
        headers: { Accept: "text/event-stream" },
        body: JSON.stringify(body),
      });

      if (await handle401(streamRes)) return;

      if (!streamRes.ok) {
        // Errors may be JSON; AI success path is always SSE + getReader.
        const data = (await streamRes.json().catch(() => ({}))) as {
          error?: string;
        };
        setMessages((prev) => prev.slice(0, -1));
        setDraft(q);
        setSendError(data.error || "Could not send message.");
        return;
      }

      let full = "";
      const streamResult = await consumeChatStream(streamRes, (chunk) => {
        full += chunk;
        applyStreamChunk(full);
      });

      if (streamResult.error) {
        setStreamDraft(null);
        setMessages((prev) => prev.slice(0, -1));
        setDraft(q);
        setSendError(streamResult.error);
        return;
      }

      if (!streamResult.hadText) {
        setStreamDraft(null);
        setMessages((prev) => prev.slice(0, -1));
        setDraft(q);
        setSendError("Could not send message.");
        return;
      }

      const meta = streamResult.meta;
      pushAiReply(full, meta.sources ?? null);

      const nextCod = (meta.cursant_cod || meta.cod || "").trim();
      if (nextCod) setCod(nextCod);
      if (meta.c != null && meta.c !== activeId) {
        adoptThread(meta.c);
      }
      await refreshThreads();
    } catch {
      setStreamDraft(null);
      setMessages((prev) => {
        const withoutUser =
          prev[prev.length - 1]?.role === "user"
            ? prev.slice(0, -1)
            : prev[prev.length - 1]?.role === "ai"
              ? prev.slice(0, -2)
              : prev;
        return withoutUser;
      });
      setDraft(q);
      setSendError("Could not send message.");
    } finally {
      setPending(false);
      setThinkingWorking(false);
      pendingStartRef.current = null;
    }
  }

  const streamBullets = streamDraft?.bullets ?? null;
  const streamReply = streamDraft?.reply ?? "";
  const showStreamThinking =
    pending &&
    (thinkingWorking ||
      Boolean(streamBullets && streamBullets.length > 0) ||
      Boolean(streamDraft?.inReasoning));
  // Bubble only in phase 2 (after ###) — never reasoning body.
  const showStreamBubble = Boolean(streamDraft?.inReply && streamReply.length > 0);
  const showStreamCursor = Boolean(streamDraft?.inReply && pending);

  return (
    <main className="flex h-dvh max-h-dvh min-h-0 flex-1 flex-col overflow-hidden">
      <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="lab-utility-row flex shrink-0 items-center gap-3 px-4 sm:px-5">
          <h1
            className="text-lg font-semibold text-accent"
            style={{ fontFamily: "var(--font-fraunces), serif" }}
          >
            Chat
          </h1>
          <label className="ml-auto flex min-w-[12rem] max-w-xs flex-1 items-center text-sm sm:flex-initial">
            <span className="sr-only">Student</span>
            <select
              value={cod}
              onChange={(e) => void onCodChange(e.target.value)}
              className="h-9 w-full rounded-md border border-line bg-surface px-3 outline-none ring-honey/40 focus:ring-2"
            >
              <option value="">Alege cursant</option>
              {cursanti.map((c) => (
                <option key={c.cod} value={c.cod}>
                  {c.cod} — {c.nume}
                </option>
              ))}
            </select>
          </label>
        </header>

        <div
          ref={streamRef}
          className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 py-4 sm:px-5"
        >
          {messagesError ? (
            <p className="text-sm text-red-800" role="alert">
              {messagesError}
            </p>
          ) : null}

          {loadingMessages ? (
            <p className="text-sm text-foreground/55">Loading messages…</p>
          ) : null}

          {!loadingMessages && messages.length === 0 && !messagesError ? (
            <p className="text-sm text-foreground/55">
              {activeId == null
                ? "Write a message for a new thread."
                : "No messages in this thread."}
            </p>
          ) : null}

          {messages.map((m, i) => {
            const mine = m.role === "user" || m.role === "me";
            if (mine) {
              return (
                <div
                  key={`${m.role}-${i}`}
                  className="ml-auto max-w-[72%] rounded-[16px_16px_4px_16px] bg-[#2C5F45] px-3.5 py-2.5 text-sm text-[#F4EFE6]"
                >
                  <span className="whitespace-pre-wrap">{m.text}</span>
                </div>
              );
            }

            const parsed = parseTwoPhase(m.text);
            const bullets = m.thinking?.bullets ?? parsed.bullets ?? null;
            const reply = parsed.reply || m.text;
            const chips = sourceChips(m.sources);

            return (
              <div
                key={`${m.role}-${i}`}
                className="flex max-w-[78%] flex-col gap-1.5 self-start"
              >
                {bullets ? (
                  <ThinkingState
                    working={false}
                    durationSec={m.thinking?.durationSec}
                    rows={bullets.map((primary) => ({ primary }))}
                  />
                ) : null}
                <div className="rounded-[16px_16px_16px_4px] border border-line bg-surface px-3.5 py-2.5 text-sm text-foreground">
                  <ChatText text={reply} />
                </div>
                {chips.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5 pl-0.5">
                    <span className="text-[11px] font-medium tracking-wide text-foreground/40 uppercase">
                      Surse
                    </span>
                    {chips.map((label) => (
                      <span
                        key={label}
                        className="inline-flex items-center rounded-md border border-line bg-background px-2 py-0.5 text-[11.5px] text-ink-2"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="flex items-center gap-1 pl-0.5">
                  <button
                    type="button"
                    title="Update"
                    aria-label="Update"
                    onClick={() => openUpdate(cod)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-foreground/45 transition hover:bg-accent/[0.08] hover:text-accent"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="15"
                      height="15"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}

          {showStreamThinking || showStreamBubble || showStreamCursor ? (
            <div className="flex max-w-[78%] flex-col gap-1.5 self-start">
              {showStreamThinking ? (
                <ThinkingState
                  working={
                    thinkingWorking || Boolean(streamDraft?.inReasoning)
                  }
                  rows={
                    streamBullets?.map((primary) => ({ primary })) ?? undefined
                  }
                />
              ) : null}
              {showStreamBubble || showStreamCursor ? (
                <div className="rounded-[16px_16px_16px_4px] border border-line bg-surface px-3.5 py-2.5 text-sm text-foreground">
                  {showStreamBubble ? <ChatText text={streamReply} /> : null}
                  {showStreamCursor ? (
                    <span
                      className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-foreground/45 align-middle"
                      aria-hidden
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : pending && thinkingWorking ? (
            <div className="flex max-w-[78%] flex-col self-start">
              <ThinkingState working />
            </div>
          ) : null}
        </div>

        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void onSend();
          }}
          className="shrink-0 bg-[#FFFCF7] px-4 pb-4 pt-2 sm:px-5"
        >
          {sendError ? (
            <p
              className="mx-auto mb-2 max-w-[640px] text-sm text-red-800"
              role="alert"
            >
              {sendError}
            </p>
          ) : null}
          <div className="mx-auto flex min-h-[48px] max-w-[640px] items-center gap-2 rounded-[24px] border border-[#D9D0C4] bg-white py-2 pl-[18px] pr-2">
            <textarea
              ref={composerRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                requestAnimationFrame(resizeComposer);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (pending || !draft.trim()) return;
                  void onSend();
                }
              }}
              rows={1}
              placeholder={
                cod ? `Ask about ${cod}…` : "Ask about …"
              }
              className="h-[22px] max-h-[88px] flex-1 resize-none overflow-hidden border-0 bg-transparent p-0 text-[16px] leading-[22px] text-[#2C5F45] outline-none placeholder:text-[#9A948A]"
              style={{
                fontFamily: "var(--font-figtree), sans-serif",
                verticalAlign: "middle",
              }}
            />
            <button
              type="button"
              disabled={pending || !draft.trim()}
              onClick={() => void onSend()}
              aria-label="Trimite"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2C5F45] text-white transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-[0.35]"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden
              >
                <path
                  d="M8 12.5V3.5M8 3.5L3.5 8M8 3.5L12.5 8"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <main className="flex h-dvh max-h-dvh min-h-0 flex-1 flex-col items-center justify-center">
          <p className="text-sm text-foreground/60">Loading…</p>
        </main>
      }
    >
      <ChatPageInner />
    </Suspense>
  );
}
