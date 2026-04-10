import { requestJson } from "./api";

type ToggleFollowResponse = {
  following: boolean;
};

type FollowingListResponse = {
  items: string[];
};

const STORAGE_KEY = "sc_follows_v1";

export async function toggleFollow(targetId: string): Promise<boolean> {
  const remote = await tryToggleFollowRemote(targetId);
  if (typeof remote === "boolean") return remote;
  return toggleFollowLocal(targetId);
}

export async function syncFollowingFromRemote(): Promise<string[] | null> {
  try {
    const res = await requestJson<FollowingListResponse>("GET", "/users/me/following");
    if (!res || !Array.isArray(res.items)) return null;
    const ids = res.items.map((x) => String(x)).filter(Boolean);
    writeAll(ids);
    return ids;
  } catch {
    return null;
  }
}

export function getIsFollowing(targetId: string): boolean {
  const list = readAll();
  return list.includes(targetId);
}

function toggleFollowLocal(targetId: string): boolean {
  const list = readAll();
  const exists = list.includes(targetId);
  const next = exists ? list.filter((x) => x !== targetId) : [...list, targetId];
  writeAll(next);
  return !exists;
}

async function tryToggleFollowRemote(targetId: string): Promise<boolean | null> {
  try {
    const res = await requestJson<ToggleFollowResponse>("POST", `/users/${encodeURIComponent(targetId)}/follow`, {});
    if (typeof res?.following !== "boolean") return null;
    const list = readAll();
    const exists = list.includes(targetId);
    const next = res.following ? (exists ? list : [...list, targetId]) : list.filter((x) => x !== targetId);
    writeAll(next);
    return res.following;
  } catch {
    return null;
  }
}

function readAll(): string[] {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(String(raw)) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => String(x)).filter(Boolean);
  } catch {
    return [];
  }
}

function writeAll(ids: string[]) {
  wx.setStorageSync(STORAGE_KEY, JSON.stringify(ids));
}
