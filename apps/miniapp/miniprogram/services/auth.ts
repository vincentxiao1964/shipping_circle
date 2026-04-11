import { clearToken, requestJson, setToken } from "./api";

export type LoginResponse = {
  token: string;
  expiresAt?: number;
  user: {
    id: string;
    displayName?: string;
  };
};

export async function loginWithWeChatCode(code: string): Promise<LoginResponse> {
  const res = await requestJson<LoginResponse>("POST", "/auth/wechat", { code }, null);
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
