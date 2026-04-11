import { clearToken, requestJson, setToken } from "./api";

export type LoginResponse = {
  token: string;
  expiresAt?: number;
  user: {
    id: string;
    displayName?: string;
  };
};

function getOrCreateMockOpenId(): string {
  try {
    const existing = wx.getStorageSync("sc_mock_openid");
    if (typeof existing === "string" && existing.trim()) return existing.trim();
  } catch {}
  const next = `mock_${Date.now()}_${Math.random().toString(16).slice(2)}_${Math.random().toString(16).slice(2)}`;
  try {
    wx.setStorageSync("sc_mock_openid", next);
  } catch {}
  return next;
}

export async function loginWithWeChatCode(code: string): Promise<LoginResponse> {
  const mockOpenId = getOrCreateMockOpenId();
  const res = await requestJson<LoginResponse>("POST", "/auth/wechat", { code, mockOpenId }, null);
  setToken(res.token, typeof res.expiresAt === "number" ? res.expiresAt : undefined);
  wx.setStorageSync("sc_userId", res.user.id);
  if (res.user.displayName) wx.setStorageSync("sc_displayName", res.user.displayName);
  return res;
}

export async function logoutRemote(): Promise<void> {
  try {
    await requestJson<{ ok: boolean }>("POST", "/auth/logout", {}, null);
  } catch {}
  clearToken();
}

export function getUserId(): string | null {
  try {
    const v = wx.getStorageSync("sc_userId");
    return typeof v === "string" && v ? v : null;
  } catch {
    return null;
  }
}

export function clearUser() {
  try {
    wx.removeStorageSync("sc_userId");
    wx.removeStorageSync("sc_displayName");
  } catch {}
}
