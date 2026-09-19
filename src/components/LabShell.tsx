"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BrightNestMark } from "@/components/BrightNestMark";
import { GlobalSearch } from "@/components/GlobalSearch";
import {
  LabChatProvider,
  useLabChat,
} from "@/components/LabChatContext";
import { UpdateModalProvider } from "@/components/UpdateModal";
import { UserMenuDropdown } from "@/components/UserMenuDropdown";
import { apiFetch, type Me } from "@/lib/api";

const NAV_LS = "lab-nav-collapsed";
const SIDEBAR_EXPANDED = 200;
const SIDEBAR_COLLAPSED = 56;

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

const IcoCursanti = (
  <Icon>
    <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </Icon>
);

const IcoChat = (
  <Icon>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </Icon>
);

const IcoInbox = (
  <Icon>
    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </Icon>
);

const IcoLectori = (
  <Icon>
    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="8.5" cy="7" r="4" />
    <polyline points="17 11 19 13 23 9" />
  </Icon>
);

const IcoInscrieri = (
  <Icon>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </Icon>
);

const IcoEu = (
  <Icon>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </Icon>
);

const IcoSetari = (
  <Icon>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </Icon>
);

const IcoCalendar = (
  <Icon>
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </Icon>
);

const IcoSearch = (
  <Icon>
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </Icon>
);

const IcoPlus = (
  <Icon>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </Icon>
);

function navClass(active: boolean, collapsed: boolean) {
  const base = collapsed
    ? "lab-nav-item flex h-9 items-center justify-center gap-0 overflow-visible"
    : "lab-nav-item flex h-9 w-full items-center gap-2.5 overflow-hidden px-2.5";
  return active ? `${base} lab-nav-item--active font-medium` : base;
}

function readCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(NAV_LS) === "1";
  } catch {
    return false;
  }
}

const THREADS_COLLAPSED_LIMIT = 6;

function ChatThreadsPanel({ collapsed }: { collapsed: boolean }) {
  const {
    activeId,
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
    filteredThreads,
  } = useLabChat();
  const searchRef = useRef<HTMLInputElement>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (searchOpen && !collapsed) {
      searchRef.current?.focus();
    }
  }, [searchOpen, collapsed]);

  if (collapsed) return null;

  const sortedThreads = [...filteredThreads].sort((a, b) => {
    const ta = a.updated_at ? Date.parse(a.updated_at) : 0;
    const tb = b.updated_at ? Date.parse(b.updated_at) : 0;
    return tb - ta;
  });
  const needsExpand = sortedThreads.length > THREADS_COLLAPSED_LIMIT;
  const visibleThreads =
    showAll && needsExpand
      ? sortedThreads
      : sortedThreads.slice(0, THREADS_COLLAPSED_LIMIT);

  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-white/15 pt-2">
      <div className="flex shrink-0 items-center gap-1 px-2.5 pb-1.5">
        <span className="min-w-0 flex-1 text-[11px] font-semibold tracking-wide text-[#F4EFE6]/55 uppercase">
          Conversations
        </span>
        <button
          type="button"
          title="Search"
          aria-label="Search conversations"
          aria-pressed={searchOpen}
          onClick={() => {
            setSearchOpen(!searchOpen);
            if (searchOpen) setSearchQuery("");
          }}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#F4EFE6]/70 transition hover:bg-white/[0.08] hover:text-[#F4EFE6]"
        >
          {IcoSearch}
        </button>
      </div>

      {searchOpen ? (
        <div className="shrink-0 px-2.5 pb-2">
          <input
            ref={searchRef}
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search…"
            className="w-full rounded-md border border-transparent bg-white/10 px-2.5 py-1.5 text-sm text-[#F4EFE6] outline-none placeholder:text-[#C8D4CC] focus:ring-2 focus:ring-honey/40"
          />
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        <button
          type="button"
          onClick={newThread}
          className="mb-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium text-[#F4EFE6] transition hover:bg-white/[0.08]"
        >
          {IcoPlus}
          <span>New chat</span>
        </button>

        {threadsError ? (
          <p className="px-2 py-2 text-xs text-red-200" role="alert">
            {threadsError}
          </p>
        ) : null}

        {threads === null && !threadsError ? (
          <p className="px-2 py-2 text-xs text-[#F4EFE6]/55">Loading…</p>
        ) : null}

        {threads && filteredThreads.length === 0 && !threadsError ? (
          <p className="px-2 py-2 text-xs text-[#F4EFE6]/55">
            {searchQuery.trim()
              ? "No results."
              : "No conversations."}
          </p>
        ) : null}

        {visibleThreads.map((t) => {
          const on = t.id === activeId;
          const label = t.titlu?.trim() || "Thread";
          return (
            <div
              key={t.id}
              className={
                on
                  ? "mb-0.5 flex items-start gap-0.5 rounded-md bg-[#3D7A58]"
                  : "mb-0.5 flex items-start gap-0.5 rounded-md hover:bg-white/[0.08]"
              }
            >
              <button
                type="button"
                onClick={() => selectThread(t.id)}
                className={
                  on
                    ? "min-w-0 flex-1 px-2.5 py-2 text-left text-sm font-medium text-white"
                    : "min-w-0 flex-1 px-2.5 py-2 text-left text-sm text-[#F4EFE6]/85"
                }
              >
                <span className="line-clamp-2">{label}</span>
              </button>
              <button
                type="button"
                title="Delete"
                disabled={delPending === t.id}
                onClick={() => void deleteThread(t.id)}
                className="shrink-0 px-2 py-2 text-sm text-[#F4EFE6]/45 transition hover:text-red-200 disabled:opacity-60"
              >
                {delPending === t.id ? "…" : "×"}
              </button>
            </div>
          );
        })}

        {needsExpand ? (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="mt-0.5 w-full px-2.5 py-1.5 text-left text-[12.5px] text-white/70 transition hover:text-white"
          >
            {showAll ? "Show less" : "See all"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function LabShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLector, setIsLector] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [inboxCount, setInboxCount] = useState(0);

  const chatActive =
    pathname === "/chat" || pathname.startsWith("/chat/");
  const inboxActive =
    pathname === "/inbox" || pathname.startsWith("/inbox/");
  const dosarActive =
    pathname === "/dosar" || pathname.startsWith("/dosar/");
  const cursantiActive =
    pathname === "/cursanti" ||
    dosarActive ||
    pathname === "/edit" ||
    pathname === "/profil";
  const lectoriActive =
    pathname === "/lectori" || pathname.startsWith("/lectori/");
  const inscrieriActive =
    pathname === "/inscrieri" || pathname.startsWith("/inscrieri/");
  const euActive = pathname === "/eu" || pathname.startsWith("/eu/");
  const setariActive =
    pathname === "/setari" || pathname.startsWith("/setari/");
  const calendarActive =
    pathname === "/calendar" || pathname.startsWith("/calendar/");

  useEffect(() => {
    let cancelled = false;

    async function loadMe() {
      try {
        const res = await apiFetch("/me");
        if (!res.ok) return;
        const data = (await res.json()) as Me;
        if (!cancelled) {
          setIsAdmin(data.role === "admin");
          setIsLector(data.role === "lector");
          setMe({
            ...data,
            avatar: data.avatar ?? null,
          });
        }
      } catch {
        // ignore — nav still works without role
      }
    }

    void loadMe();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadInboxBadge() {
      try {
        const res = await apiFetch("/inbox?cat=toate");
        if (!res.ok) return;
        const data = (await res.json()) as {
          counts?: { toate?: number };
        };
        const n = Number(data.counts?.toate ?? 0);
        if (!cancelled) setInboxCount(Number.isFinite(n) && n > 0 ? n : 0);
      } catch {
        // ignore — badge optional
      }
    }

    void loadInboxBadge();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(NAV_LS, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  const width = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;

  return (
    <div className="relative flex h-full min-h-0 flex-1 overflow-hidden">
      {/* One sidebar — width only; flex sibling so stage never shows a second green strip */}
      <aside
        style={{ width, minWidth: width, maxWidth: width }}
        className={`lab-sidebar flex min-h-0 shrink-0 flex-col overflow-hidden self-stretch${
          collapsed ? " lab-sidebar--collapsed" : ""
        }`}
      >
        {/* Brand — first item in the sidebar, no border/line under it. */}
        <div
          className={`lab-sidebar-brand flex shrink-0 items-center ${
            collapsed ? "py-4" : "px-3.5 py-4"
          }`}
        >
          <Link
            href="/cursanti"
            title="BrightNest Lab"
            className={`lab-sidebar-brand-link flex min-w-0 items-center overflow-hidden rounded-md outline-none ring-honey/40 focus-visible:ring-2 ${
              collapsed ? "h-9 justify-center gap-0" : "w-full gap-2"
            }`}
          >
            <BrightNestMark
              size={28}
              className="h-7 w-7 shrink-0 object-contain"
            />
            <span
              className="lab-brand-wordmark text-sm font-semibold text-[#F4EFE6]"
              style={{ fontFamily: "var(--font-fraunces), serif" }}
            >
              BrightNest Lab
            </span>
          </Link>
        </div>

        {/* Primary nav */}
        <nav
          className={`lab-sidebar-nav mt-1 flex shrink-0 flex-col gap-0.5 text-sm ${
            collapsed ? "" : "px-2"
          }`}
        >
          <Link
            href="/cursanti"
            title="Students"
            className={navClass(cursantiActive, collapsed)}
          >
            <span className="lab-nav-icon">{IcoCursanti}</span>
            <span className="lab-nav-label">Students</span>
          </Link>

          <Link
            href="/inbox"
            title={inboxCount > 0 ? `Inbox (${inboxCount})` : "Inbox"}
            className={navClass(inboxActive, collapsed)}
          >
            <span className="lab-nav-icon">
              {IcoInbox}
              {collapsed && inboxCount > 0 ? (
                <span className="lab-nav-badge" />
              ) : null}
            </span>
            <span className="lab-nav-label">Inbox</span>
            {inboxCount > 0 ? (
              <span className="lab-nav-meta ml-auto tabular-nums text-xs text-[#D4A017]">
                {inboxCount}
              </span>
            ) : null}
          </Link>

          <Link
            href="/chat"
            title="Chat"
            className={navClass(chatActive, collapsed)}
          >
            <span className="lab-nav-icon">{IcoChat}</span>
            <span className="lab-nav-label">Chat</span>
          </Link>

          <Link
            href="/calendar"
            title="Calendar"
            className={navClass(calendarActive, collapsed)}
          >
            <span className="lab-nav-icon">{IcoCalendar}</span>
            <span className="lab-nav-label">Calendar</span>
          </Link>

          {isAdmin ? (
            <Link
              href="/lectori"
              title="Lecturers"
              className={navClass(lectoriActive, collapsed)}
            >
              <span className="lab-nav-icon">{IcoLectori}</span>
              <span className="lab-nav-label">Lecturers</span>
            </Link>
          ) : null}

          {isAdmin ? (
            <Link
              href="/inscrieri"
              title="Enrollments"
              className={navClass(inscrieriActive, collapsed)}
            >
              <span className="lab-nav-icon">{IcoInscrieri}</span>
              <span className="lab-nav-label">Enrollments</span>
            </Link>
          ) : null}

          {isLector ? (
            <Link
              href="/eu"
              title="Me"
              className={navClass(euActive, collapsed)}
            >
              <span className="lab-nav-icon">{IcoEu}</span>
              <span className="lab-nav-label">Me</span>
            </Link>
          ) : null}

          {isAdmin ? (
            <Link
              href="/setari"
              title="Settings"
              className={navClass(setariActive, collapsed)}
            >
              <span className="lab-nav-icon">{IcoSetari}</span>
              <span className="lab-nav-label">Settings</span>
            </Link>
          ) : null}
        </nav>

        {/* Chat threads — only on /chat, hidden when collapsed */}
        {chatActive ? <ChatThreadsPanel collapsed={collapsed} /> : (
          <div className="min-h-0 flex-1" />
        )}

        {/* Footer — user chip + collapse chevron */}
        <div className="lab-sidebar-footer">
          <UserMenuDropdown
            variant="sidebar"
            compact={collapsed}
            className="lab-sidebar-user min-w-0"
            menuPlacement="up"
            menuSide={collapsed ? "right" : "auto"}
            align="left"
            initialMe={me}
          />
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? "Expand menu" : "Collapse menu"}
            aria-label={collapsed ? "Expand menu" : "Collapse menu"}
            aria-expanded={!collapsed}
            className="lab-collapse-btn"
          >
            {collapsed ? "›" : "‹"}
          </button>
        </div>
      </aside>

      {/* Main stage — green behind the floating cream card. Search stays in
          the top strip; the card is inset 12px L/R with both top corners
          rounded (HubSpot-style tuck under the strip). */}
      <div
        style={{ minHeight: "100vh" }}
        className="lab-stage flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      >
        <div className="lab-top flex shrink-0 items-center gap-3">
          <GlobalSearch isAdmin={isAdmin} />
        </div>

        <div className="lab-card-slot flex min-h-0 flex-1 flex-col">
          <div className="lab-card flex min-h-0 flex-1 flex-col">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LabShell({ children }: { children: React.ReactNode }) {
  return (
    <LabChatProvider>
      <UpdateModalProvider>
        <LabShellInner>{children}</LabShellInner>
      </UpdateModalProvider>
    </LabChatProvider>
  );
}
