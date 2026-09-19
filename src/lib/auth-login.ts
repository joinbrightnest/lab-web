/**
 * Lab lecturer/admin JSON login — Caddy proxies /lab/api* → Flask :5050.
 * Never POST HTML /login (Next 404 HTML on lab host).
 */
export const AUTH_LOGIN_URL = "/lab/api/login";

/**
 * Student JSON login — Caddy proxies /lab/api* → Flask :5050.
 * Never POST HTML /login (405 / HTML on students host).
 */
export const STUDENT_LOGIN_URL = "/lab/api/student-login";

export type AuthPortal = "lab" | "student";

export type AuthLoginOk = {
  ok: true;
  role: string;
  name: string;
};

export type AuthLoginFail = {
  ok: false;
  error: string;
};

const TIMEOUT_MS = 8000;

function isJsonResponse(res: Response): boolean {
  const ct = res.headers.get("content-type") || "";
  return ct.toLowerCase().includes("application/json");
}

async function readJsonBody(
  res: Response,
): Promise<{ ok?: boolean; role?: string; name?: string; error?: string }> {
  if (!isJsonResponse(res)) return {};
  try {
    return await res.json();
  } catch {
    return {};
  }
}

/**
 * Lab sign-in: POST /lab/api/login → {ok, error}, sets session cookie.
 * 401 → wrong password; 500 → Server error; network → API offline.
 * Never map 500 to wrong password. Never POST HTML /login.
 */
export async function authLogin(
  username: string,
  password: string,
  portal: AuthPortal = "lab",
): Promise<AuthLoginOk | AuthLoginFail> {
  if (portal === "student") {
    return studentLogin(username, password);
  }
  return labLogin(username, password);
}

/**
 * POST /lab/api/login with credentials + JSON body {username, password}.
 */
export async function labLogin(
  username: string,
  password: string,
): Promise<AuthLoginOk | AuthLoginFail> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(AUTH_LOGIN_URL, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      signal: ctrl.signal,
    });
    const data = await readJsonBody(res);
    if (res.ok && data.ok) {
      return {
        ok: true,
        role: String(data.role || ""),
        name: String(data.name || ""),
      };
    }
    if (res.status === 401) {
      return {
        ok: false,
        error: data.error || "Wrong user or password",
      };
    }
    if (res.status >= 500 || res.status === 0) {
      return { ok: false, error: "Server error" };
    }
    return {
      ok: false,
      error: data.error || `Error ${res.status}`,
    };
  } catch {
    return { ok: false, error: "API offline" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Student sign-in: POST /lab/api/student-login → {ok, error}, sets session cookie.
 */
export async function studentLogin(
  username: string,
  password: string,
): Promise<AuthLoginOk | AuthLoginFail> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(STUDENT_LOGIN_URL, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      signal: ctrl.signal,
    });
    const data = await readJsonBody(res);
    if (res.ok && data.ok) {
      return {
        ok: true,
        role: String(data.role || "cursant"),
        name: String(data.name || ""),
      };
    }
    if (res.status === 401) {
      return {
        ok: false,
        error: data.error || "Wrong user or password",
      };
    }
    if (res.status >= 500 || res.status === 0) {
      return { ok: false, error: "Server error" };
    }
    return {
      ok: false,
      error: data.error || `Error ${res.status}`,
    };
  } catch {
    return { ok: false, error: "API offline" };
  } finally {
    clearTimeout(timer);
  }
}
