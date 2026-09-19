/** Hostname for the public student portal. */
export const STUDENTS_HOST = "students.joinbrightnest.com";
export const STUDENTS_ORIGIN = `https://${STUDENTS_HOST}`;

export function isStudentsHost(hostname?: string): boolean {
  const h =
    hostname ??
    (typeof window !== "undefined" ? window.location.hostname : "");
  return h === STUDENTS_HOST;
}

function isLocalDevHost(hostname?: string): boolean {
  const h =
    hostname ??
    (typeof window !== "undefined" ? window.location.hostname : "");
  return h === "localhost" || h === "127.0.0.1" || h.endsWith(".local");
}

/** Client-side paths: clean URLs on students host; stable local routes on localhost. */
export function studentPaths(hostname?: string) {
  if (isStudentsHost(hostname)) {
    return { home: "/", login: "/login" } as const;
  }
  return { home: "/student", login: "/student-login" } as const;
}

/**
 * Navigate after login / logout / 401.
 * Students host → absolute https://students.joinbrightnest.com/ (or /login).
 * Never /cursanti, /lab, or lab.infra-privatepublish.com.
 * Localhost → Next /student or /student-login.
 * Any other host (Lab prod) → leave to students portal.
 */
export function goStudent(
  kind: "home" | "login",
  router: { replace: (href: string) => void },
) {
  const abs =
    kind === "home" ? `${STUDENTS_ORIGIN}/` : `${STUDENTS_ORIGIN}/login`;
  if (typeof window !== "undefined") {
    if (isStudentsHost() || !isLocalDevHost()) {
      window.location.replace(abs);
      return;
    }
  }
  router.replace(studentPaths()[kind]);
}
