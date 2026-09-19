"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch, type Conversatie } from "@/lib/api";

export type LabChatContextValue = {
  activeId: number | null;
  /** Bumps when user picks a thread or starts a new one (not after send adopts id). */
  selectionEpoch: number;
  threads: Conversatie[] | null;
  threadsError: string;
  delPending: number | null;
  searchOpen: boolean;
  searchQuery: string;
  setSearchOpen: (open: boolean) => void;
  setSearchQuery: (q: string) => void;
  selectThread: (id: number) => void;
  newThread: () => void;
  deleteThread: (id: number) => Promise<void>;
  /** After send — set active conversation without reloading messages. */
  adoptThread: (id: number) => void;
  refreshThreads: () => Promise<void>;
  filteredThreads: Conversatie[];
};

const LabChatContext = createContext<LabChatContextValue | null>(null);

export function LabChatProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const onChat =
    pathname === "/chat" || pathname.startsWith("/chat/");

  const [activeId, setActiveId] = useState<number | null>(null);
  const [selectionEpoch, setSelectionEpoch] = useState(0);
  const [threads, setThreads] = useState<Conversatie[] | null>(null);
  const [threadsError, setThreadsError] = useState("");
  const [delPending, setDelPending] = useState<number | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  const refreshThreads = useCallback(async () => {
    try {
      const res = await apiFetch("/conversatii");
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        setThreadsError("Could not load conversations.");
        return;
      }
      const data = (await res.json()) as Conversatie[];
      setThreads(data);
      setThreadsError("");
    } catch {
      setThreadsError("Could not load conversations.");
    }
  }, [router]);

  useEffect(() => {
    if (!onChat) return;
    let cancelled = false;

    async function boot() {
      try {
        const res = await apiFetch("/conversatii");
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (!res.ok) {
          if (!cancelled) {
            setThreadsError("Could not load conversations.");
          }
          return;
        }
        const data = (await res.json()) as Conversatie[];
        if (!cancelled) {
          setThreads(data);
          setThreadsError("");
        }
      } catch {
        if (!cancelled) {
          setThreadsError("Could not load conversations.");
        }
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [onChat, router]);

  const selectThread = useCallback((id: number) => {
    if (activeIdRef.current === id) return;
    setActiveId(id);
    setSelectionEpoch((e) => e + 1);
  }, []);

  const newThread = useCallback(() => {
    setActiveId(null);
    setSelectionEpoch((e) => e + 1);
  }, []);

  const adoptThread = useCallback((id: number) => {
    setActiveId(id);
  }, []);

  const deleteThread = useCallback(
    async (id: number) => {
      if (delPending != null) return;
      if (!confirm("Delete this conversation?")) return;
      setDelPending(id);
      setThreadsError("");
      try {
        const res = await apiFetch("/chat-del", {
          method: "POST",
          body: JSON.stringify({ c: id }),
        });
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        if (!res.ok) {
          setThreadsError("Could not delete conversation.");
          return;
        }
        if (activeId === id) {
          setActiveId(null);
          setSelectionEpoch((e) => e + 1);
        }
        await refreshThreads();
      } catch {
        setThreadsError("Could not delete conversation.");
      } finally {
        setDelPending(null);
      }
    },
    [activeId, delPending, refreshThreads, router],
  );

  const filteredThreads = useMemo(() => {
    if (!threads) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) =>
      (t.titlu?.trim() || "Thread").toLowerCase().includes(q),
    );
  }, [threads, searchQuery]);

  const value = useMemo<LabChatContextValue>(
    () => ({
      activeId,
      selectionEpoch,
      threads,
      threadsError,
      delPending,
      searchOpen,
      searchQuery,
      setSearchOpen,
      setSearchQuery,
      selectThread,
      newThread,
      deleteThread,
      adoptThread,
      refreshThreads,
      filteredThreads,
    }),
    [
      activeId,
      selectionEpoch,
      threads,
      threadsError,
      delPending,
      searchOpen,
      searchQuery,
      selectThread,
      newThread,
      deleteThread,
      adoptThread,
      refreshThreads,
      filteredThreads,
    ],
  );

  return (
    <LabChatContext.Provider value={value}>{children}</LabChatContext.Provider>
  );
}

export function useLabChat(): LabChatContextValue {
  const ctx = useContext(LabChatContext);
  if (!ctx) {
    throw new Error("useLabChat must be used within LabChatProvider");
  }
  return ctx;
}
