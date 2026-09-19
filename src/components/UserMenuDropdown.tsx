"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  apiFetch,
  resolveMeEmail,
  type Me,
} from "@/lib/api";
import { goStudent } from "@/lib/student-paths";
import { cn } from "@/lib/cn";

const DEFAULT_AVATAR = "/avatars/default.png";
const LECTOR_DEFAULT_AVATAR = "/avatars/oana.png";

function initialsFromName(name: string, username: string): string {
  const raw = (name || "").trim() || (username || "").trim() || "?";
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  }
  return raw.slice(0, 2).toUpperCase();
}

export function resolveAvatarSrc(me: Pick<Me, "avatar" | "role">): string {
  const custom = (me.avatar || "").trim();
  if (custom) return custom;
  if ((me.role || "").trim() === "lector") return LECTOR_DEFAULT_AVATAR;
  return DEFAULT_AVATAR;
}

export type UserMenuDropdownProps = {
  /** Always avatar-only (e.g. collapsed sidebar). */
  compact?: boolean;
  /** Full pill on sm+, avatar-only below (student header). */
  compactOnMobile?: boolean;
  /**
   * sidebar: flat footer chrome on the green rail.
   * topbar: legacy white pill for the green top strip (unused in LabShell).
   */
  variant?: "default" | "sidebar" | "topbar";
  /** Dropdown opens above (sidebar footer) or below (header). */
  menuPlacement?: "up" | "down";
  /**
   * When compact (collapsed rail), open menu to the right of the trigger
   * so it is not clipped by the sidebar.
   */
  menuSide?: "auto" | "right";
  /** Force dropdown edge; default auto from viewport. */
  align?: "auto" | "left" | "right";
  className?: string;
  /** Extra classes on the trigger button (Lab green chrome). */
  triggerClassName?: string;
  initialMe?: Me | null;
};

type MenuCoords = {
  top: number;
  left: number;
  width: number;
};

export function UserMenuDropdown({
  compact = false,
  compactOnMobile = false,
  variant = "default",
  menuPlacement = "down",
  menuSide = "auto",
  align = "auto",
  className,
  triggerClassName,
  initialMe = null,
}: UserMenuDropdownProps) {
  const router = useRouter();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [me, setMe] = useState<Me | null>(initialMe);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<MenuCoords | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (initialMe) setMe(initialMe);
  }, [initialMe]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/me");
        if (!res.ok) return;
        const data = (await res.json()) as Me & { ok?: boolean };
        if (cancelled) return;
        setMe({
          id: data.id,
          username: data.username,
          name: data.name,
          role: data.role,
          email: data.email ?? resolveMeEmail(data),
          avatar: data.avatar ?? null,
        });
        setImgFailed(false);
      } catch {
        // keep initialMe / empty
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const placeMenu = useCallback(() => {
    const btn = triggerRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuW = Math.max(220, compact ? 220 : Math.min(280, rect.width));
    const gap = 8;

    if (compact || menuSide === "right") {
      let left = rect.right + gap;
      if (left + menuW > window.innerWidth - 8) {
        left = Math.max(8, rect.left - menuW - gap);
      }
      setCoords({
        top: menuPlacement === "up" ? Math.max(8, rect.bottom - 200) : rect.top,
        left,
        width: menuW,
      });
      return;
    }

    let nextEdge: "left" | "right" = "left";
    if (align === "right") nextEdge = "right";
    else if (align === "left") nextEdge = "left";
    else {
      const spaceRight = window.innerWidth - rect.left;
      nextEdge = spaceRight < menuW + 12 ? "right" : "left";
    }

    const left =
      nextEdge === "right"
        ? Math.max(8, rect.right - menuW)
        : Math.min(rect.left, window.innerWidth - menuW - 8);

    const width = Math.max(menuW, Math.min(280, rect.width));
    if (menuPlacement === "up") {
      setCoords({
        top: Math.max(8, rect.top - 200),
        left,
        width,
      });
    } else {
      setCoords({
        top: rect.bottom + gap,
        left,
        width,
      });
    }
  }, [align, compact, menuPlacement, menuSide]);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    placeMenu();
    function onScroll() {
      placeMenu();
    }
    window.addEventListener("resize", onScroll);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, placeMenu]);

  useLayoutEffect(() => {
    if (!open || !coords || menuPlacement !== "up") return;
    const el = menuRef.current;
    const btn = triggerRef.current;
    if (!el || !btn) return;
    const h = el.getBoundingClientRect().height;
    const rect = btn.getBoundingClientRect();
    const top = Math.max(8, rect.top - h - 8);
    if (Math.abs(top - coords.top) > 1) {
      setCoords((c) => (c ? { ...c, top } : c));
    }
  }, [open, coords, menuPlacement]);

  const onLogout = useCallback(async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    const role = (me?.role || "").trim();
    try {
      // Flask clears session + Set-Cookie session=; Max-Age=0
      await fetch("/lab/api/logout", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      });
    } catch {
      // still leave
    }
    setOpen(false);
    if (role === "cursant") {
      goStudent("login", router);
      return;
    }
    // Hard redirect — not client router only (avoids stale Lab shell /me).
    window.location.href = "/login";
  }, [loggingOut, me?.role, router]);

  if (!me) {
    return (
      <div
        className={cn(
          "h-12 w-full min-w-0 animate-pulse rounded-full bg-neutral-200/60",
          compact && "size-9 min-w-0 w-9",
          variant === "sidebar" && (compact ? "size-7 rounded-full" : "h-7 rounded-md"),
          variant === "topbar" &&
            "h-[26px] w-[140px] rounded-full bg-black/20",
          className,
        )}
        aria-hidden
      />
    );
  }

  const userName = me.name?.trim() || me.username || "User";
  const userEmail = resolveMeEmail(me);
  const avatarSrc = resolveAvatarSrc(me);
  const initials = initialsFromName(userName, me.username);
  const role = (me.role || "").trim();
  const isStudent = role === "cursant";
  const sidebar = variant === "sidebar";
  const topbar = variant === "topbar";
  /* Default / topbar chip: name (+ email for default). Sidebar chip: name only. */
  const showMeta = !compact && !sidebar;
  const showSidebarName = sidebar && !compact;
  const avatarPx = topbar ? 18 : sidebar ? 28 : 36;

  const menuItemClass =
    "block w-full px-3.5 py-2 text-left text-[12px] text-[#1A1A1A] transition hover:bg-black/[0.04]";

  const panel =
    open && coords && mounted
      ? createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              width: coords.width,
              zIndex: 80,
            }}
            className="overflow-hidden rounded-[10px] border border-[#E5DCCD] bg-[#FFFcf7] py-1 shadow-[0_8px_28px_rgba(26,26,26,0.12)]"
          >
            <div className="border-b border-[#E5DCCD] px-3.5 py-2.5">
              <p className="truncate text-[13px] font-medium text-[#1A1A1A]">
                {userName}
              </p>
              {userEmail ? (
                <p className="truncate text-[11px] text-[#1A1A1A]/55">
                  {userEmail}
                </p>
              ) : null}
            </div>
            <Link
              href="/account"
              role="menuitem"
              onClick={() => setOpen(false)}
              className={menuItemClass}
            >
              View Profile
            </Link>
            <Link
              href="/account"
              role="menuitem"
              onClick={() => setOpen(false)}
              className={menuItemClass}
            >
              Account Settings
            </Link>
            {!isStudent ? (
              <Link
                href="/inbox"
                role="menuitem"
                onClick={() => setOpen(false)}
                className={menuItemClass}
              >
                Messages
              </Link>
            ) : null}
            <button
              type="button"
              role="menuitem"
              disabled={loggingOut}
              onClick={() => void onLogout()}
              className="block w-full px-3.5 py-2 text-left text-[12px] font-medium text-[#B42318] transition hover:bg-[#B42318]/08 disabled:opacity-60"
            >
              {loggingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex max-w-full items-center outline-none transition",
          topbar
            ? "lab-top-user-trigger"
            : cn(
                "focus-visible:ring-2 focus-visible:ring-[#2C5F45]/40",
                sidebar
                  ? compact
                    ? "size-7 rounded-full border-0 bg-transparent p-0"
                    : "h-7 w-full min-w-0 gap-2.5 rounded-none border-0 bg-transparent p-0"
                  : compact
                    ? "size-9 rounded-full p-0"
                    : compactOnMobile
                      ? "h-12 gap-3 rounded-full border border-transparent bg-transparent p-0 sm:w-full sm:min-w-0 sm:border-neutral-200 sm:bg-white sm:pl-1.5 sm:pr-4"
                      : "h-12 w-full min-w-0 max-w-full gap-3 rounded-full border border-neutral-200 bg-white pl-1.5 pr-4",
              ),
          triggerClassName,
        )}
      >
        <span
          className={cn(
            "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold tracking-wide",
            topbar
              ? "size-[18px] bg-white/15 text-[8px] text-white"
              : sidebar
                ? "size-7 bg-white/15 text-[10px] text-white"
                : "size-9 bg-neutral-100 text-[11px] text-[#2C1810]",
          )}
          aria-hidden
        >
          {imgFailed ? (
            initials
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- dynamic user avatar URL
            <img
              src={avatarSrc}
              alt=""
              width={avatarPx}
              height={avatarPx}
              className={cn(
                "object-cover",
                topbar ? "size-[18px]" : sidebar ? "size-7" : "size-9",
              )}
              onError={() => setImgFailed(true)}
            />
          )}
        </span>
        {showSidebarName ? (
          <span className="lab-user-name min-w-0 flex-1 truncate text-left text-[13px] font-medium leading-none text-white">
            {userName}
          </span>
        ) : null}
        {showMeta ? (
          <>
            <span
              className={cn(
                "min-w-0 flex-1 text-left",
                compactOnMobile && "hidden sm:block",
              )}
            >
              <span className="lab-user-name block text-[14px] font-medium leading-tight text-[#2C1810]">
                {userName}
              </span>
              <span className="lab-user-email block text-[10px] leading-tight text-[#9a9088]">
                {userEmail}
              </span>
            </span>
            <svg
              viewBox="0 0 24 24"
              width={16}
              height={16}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={cn(
                "lab-user-chevron shrink-0 text-[#9a9088] transition-transform",
                compactOnMobile && "hidden sm:block",
                open && "rotate-180",
              )}
              aria-hidden
            >
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </>
        ) : null}
      </button>
      {panel}
    </div>
  );
}

/** @deprecated Prefer UserMenuDropdown */
export const UserMenu = UserMenuDropdown;
