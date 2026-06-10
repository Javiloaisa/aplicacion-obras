import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  storeSession,
} from "./auth";
import type { TokenResponse } from "./types";

export class ApiError extends Error {
  status: number;

  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
  }
}

export class SessionExpiredError extends ApiError {
  constructor() {
    super(401, "Sesión caducada, vuelve a iniciar sesión");
  }
}

async function detailFrom(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body.detail === "string") return body.detail;
  } catch {
    // Non-JSON error body
  }
  return `Error ${res.status}`;
}

let refreshing: Promise<boolean> | null = null;

/** Try to refresh the session; concurrent callers share one request. */
async function tryRefresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) return false;
      try {
        const res = await fetch("/api/v1/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!res.ok) return false;
        storeSession((await res.json()) as TokenResponse);
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

/**
 * Authenticated fetch against the API with one automatic token refresh.
 * Throws ApiError on non-2xx and SessionExpiredError when auth is gone.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const doFetch = () => {
    const headers = new Headers(init.headers);
    const token = getAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(path, { ...init, headers });
  };

  let res = await doFetch();
  if (res.status === 401) {
    if (await tryRefresh()) {
      res = await doFetch();
    } else {
      clearSession();
      throw new SessionExpiredError();
    }
  }
  if (!res.ok) throw new ApiError(res.status, await detailFrom(res));
  return res;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  return (await res.json()) as T;
}

export async function apiSend<T>(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await apiFetch(path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Download an authenticated file (CSV export, media original). */
export async function apiDownload(path: string, filename: string): Promise<void> {
  const res = await apiFetch(path);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Login is the only unauthenticated call (besides /health). */
export async function login(
  username: string,
  password: string,
): Promise<TokenResponse> {
  const res = await fetch("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, client: "admin_panel" }),
  });
  if (!res.ok) throw new ApiError(res.status, await detailFrom(res));
  const tokens = (await res.json()) as TokenResponse;
  storeSession(tokens);
  return tokens;
}
