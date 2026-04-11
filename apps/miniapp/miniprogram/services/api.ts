import { t } from "../utils/i18n";

type HttpMethod = "GET" | "POST" | "PUT";
type RequestData = WechatMiniprogram.IAnyObject | string | ArrayBuffer | undefined;

export type ApiConfig = {
  baseUrl: string;
};

const DEFAULT_CONFIG: ApiConfig = {
  baseUrl: "http://localhost:8787"
};

export function getApiConfig(): ApiConfig {
  const stored = safeGetStorage("sc_api_baseUrl");
  if (typeof stored === "string" && stored.trim()) {
    return { baseUrl: stored.trim() };
  }
  return DEFAULT_CONFIG;
}

export function setApiBaseUrl(baseUrl: string) {
  wx.setStorageSync("sc_api_baseUrl", baseUrl);
}

export function getToken(): string | null {
  const token = safeGetStorage("sc_token");
  return typeof token === "string" && token ? token : null;
}

export function setToken(token: string, expiresAt?: number) {
  wx.setStorageSync("sc_token", token);
  if (typeof expiresAt === "number" && expiresAt > 0) wx.setStorageSync("sc_token_expiresAt", expiresAt);
  else {
    try {
      wx.removeStorageSync("sc_token_expiresAt");
    } catch {}
  }
}

export function clearToken() {
  try {
    wx.removeStorageSync("sc_token");
    wx.removeStorageSync("sc_token_expiresAt");
  } catch {}
}

export async function requestJson<TResponse>(
  method: HttpMethod,
  path: string,
  data?: RequestData,
  token?: string | null
): Promise<TResponse> {
  const { baseUrl } = getApiConfig();
  const url = `${baseUrl}${path}`;
  const auth = token ?? getToken();

  try {
    return await requestJsonOnce<TResponse>({ method, url, data, auth });
  } catch (e) {
    const statusCode = (e as any)?.statusCode as number | undefined;
    if (statusCode !== 401) throw e;
    if (!auth) return handleUnauthorized(e);
    if (path === "/auth/wechat" || path === "/auth/refresh" || path === "/auth/logout") {
      return handleUnauthorized(e);
    }
    const refreshed = await refreshTokenOnce(auth);
    if (!refreshed?.token) return handleUnauthorized(e);
    setToken(refreshed.token, refreshed.expiresAt);
    return requestJsonOnce<TResponse>({ method, url, data, auth: refreshed.token });
  }
}

type RequestOnceInput = { method: HttpMethod; url: string; data?: RequestData; auth?: string | null; headers?: Record<string, string> };

function requestJsonOnce<TResponse>(input: RequestOnceInput): Promise<TResponse> {
  return new Promise<TResponse>((resolve, reject) => {
    wx.request({
      method: input.method,
      url: input.url,
      data: input.data,
      header: {
        "Content-Type": "application/json",
        ...(input.headers || {}),
        ...(input.auth ? { Authorization: `Bearer ${input.auth}` } : {})
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data as TResponse);
          return;
        }
        const err: any = new Error(`HTTP ${res.statusCode}`);
        err.statusCode = res.statusCode;
        reject(err);
      },
      fail: (err) => reject(err)
    });
  });
}

export async function requestJsonWithHeaders<TResponse>(
  method: HttpMethod,
  path: string,
  data?: RequestData,
  headers?: Record<string, string>,
  token?: string | null
): Promise<TResponse> {
  const { baseUrl } = getApiConfig();
  const url = `${baseUrl}${path}`;
  const auth = token ?? getToken();
  try {
    return await requestJsonOnce<TResponse>({ method, url, data, auth, headers });
  } catch (e) {
    const statusCode = (e as any)?.statusCode as number | undefined;
    if (statusCode !== 401) throw e;
    if (!auth) return handleUnauthorized(e);
    if (path === "/auth/wechat" || path === "/auth/refresh" || path === "/auth/logout") {
      return handleUnauthorized(e);
    }
    const refreshed = await refreshTokenOnce(auth);
    if (!refreshed?.token) return handleUnauthorized(e);
    setToken(refreshed.token, refreshed.expiresAt);
    return requestJsonOnce<TResponse>({ method, url, data, auth: refreshed.token, headers });
  }
}

async function refreshToken(token: string): Promise<{ token: string; expiresAt?: number }> {
  const { baseUrl } = getApiConfig();
  const url = `${baseUrl}/auth/refresh`;
  return requestJsonOnce<{ token: string; expiresAt?: number }>({ method: "POST", url, data: {}, auth: token });
}

let refreshInFlight: Promise<{ token: string; expiresAt?: number } | null> | null = null;
async function refreshTokenOnce(token: string) {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = refreshToken(token)
    .then((r) => (r?.token ? r : null))
    .catch(() => null)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

let lastLoginRedirectAt = 0;
function handleUnauthorized<T>(err: any): T {
  clearToken();
  const now = Date.now();
  if (now - lastLoginRedirectAt > 3000) {
    lastLoginRedirectAt = now;
    wx.showToast({ title: t("auth.sessionExpired"), icon: "none" });
    const pages = getCurrentPages();
    const current = pages && pages.length > 0 ? pages[pages.length - 1] : null;
    const route = (current as any)?.route as string | undefined;
    if (route !== "pages/login/index") {
      wx.navigateTo({ url: "/pages/login/index" });
    }
  }
  throw err;
}

function safeGetStorage(key: string): unknown {
  try {
    return wx.getStorageSync(key);
  } catch {
    return undefined;
  }
}
