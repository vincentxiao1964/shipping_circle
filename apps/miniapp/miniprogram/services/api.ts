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
  const expiresAt = safeGetStorage("sc_token_expiresAt");
  if (typeof expiresAt === "number" && expiresAt > 0 && Date.now() > expiresAt) {
    clearToken();
    return null;
  }
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

  return new Promise<TResponse>((resolve, reject) => {
    wx.request({
      method,
      url,
      data,
      header: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: `Bearer ${auth}` } : {})
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data as TResponse);
          return;
        }
        if (res.statusCode === 401) {
          clearToken();
        }
        reject(new Error(`HTTP ${res.statusCode}`));
      },
      fail: (err) => reject(err)
    });
  });
}

function safeGetStorage(key: string): unknown {
  try {
    return wx.getStorageSync(key);
  } catch {
    return undefined;
  }
}
