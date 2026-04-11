import { requestJson } from "./api";

export type UserProfile = {
  id: string;
  displayName: string;
  companyId?: string;
  companyName?: string;
  businesses?: string[];
  title?: string;
  contactChannel?: string;
  contactVisibility?: "loggedIn" | "mutual" | "private";
};

type UserItemResponse = {
  item: UserProfile;
};

type UserListResponse = {
  items: UserProfile[];
};

export type UserStats = {
  id: string;
  displayName: string;
  followerCount: number;
  followingCount: number;
  postCount: number;
  requestCount?: number;
  points?: number;
  introSuccessCount?: number;
  introFailCount?: number;
  topTags?: { tag: string; count: number }[];
};

export type UserListPage = {
  items: UserProfile[];
  nextCursor: string | null;
  hasMore: boolean;
};

export async function getMe(): Promise<UserProfile | null> {
  try {
    const res = await requestJson<UserItemResponse>("GET", "/users/me");
    return res?.item ?? null;
  } catch {
    return null;
  }
}

export async function getUserById(id: string): Promise<UserProfile | null> {
  const userId = id.trim();
  if (!userId) return null;
  try {
    const res = await requestJson<UserItemResponse>("GET", `/users/${encodeURIComponent(userId)}`);
    return res?.item ?? null;
  } catch {
    return null;
  }
}

export async function getUserStats(id: string): Promise<UserStats | null> {
  const userId = id.trim();
  if (!userId) return null;
  try {
    const res = await requestJson<{ item: UserStats }>("GET", `/users/${encodeURIComponent(userId)}/stats`);
    return res?.item ?? null;
  } catch {
    return null;
  }
}

export async function getUserFollowersPage(input: { id: string; limit: number; cursor?: string }): Promise<UserListPage | null> {
  const userId = input.id.trim();
  if (!userId) return null;
  const qs = buildQuery({ limit: String(input.limit), cursor: input.cursor || "" });
  try {
    const res = await requestJson<UserListPage>("GET", `/users/${encodeURIComponent(userId)}/followers${qs}`);
    if (!res || !Array.isArray(res.items)) return null;
    return {
      items: res.items,
      nextCursor: typeof res.nextCursor === "string" ? res.nextCursor : null,
      hasMore: Boolean(res.hasMore)
    };
  } catch {
    return null;
  }
}

export async function getUserFollowingPage(input: { id: string; limit: number; cursor?: string }): Promise<UserListPage | null> {
  const userId = input.id.trim();
  if (!userId) return null;
  const qs = buildQuery({ limit: String(input.limit), cursor: input.cursor || "" });
  try {
    const res = await requestJson<UserListPage>("GET", `/users/${encodeURIComponent(userId)}/following${qs}`);
    if (!res || !Array.isArray(res.items)) return null;
    return {
      items: res.items,
      nextCursor: typeof res.nextCursor === "string" ? res.nextCursor : null,
      hasMore: Boolean(res.hasMore)
    };
  } catch {
    return null;
  }
}

export async function updateMeDisplayName(displayName: string): Promise<UserProfile | null> {
  return updateMeProfile({ displayName });
}

export async function updateMeProfile(input: {
  displayName: string;
  companyId?: string;
  companyName?: string;
  businesses?: string[];
  title?: string;
  contactChannel?: string;
  contactVisibility?: "loggedIn" | "mutual" | "private";
}): Promise<UserProfile | null> {
  try {
    const res = await requestJson<UserItemResponse>("PUT", "/users/me", input);
    return res?.item ?? null;
  } catch {
    return null;
  }
}

export async function getUsersByIds(ids: string[]): Promise<UserProfile[]> {
  const compact = ids.map((x) => x.trim()).filter(Boolean).slice(0, 50);
  if (compact.length === 0) return [];
  try {
    const res = await requestJson<UserListResponse>("GET", `/users?ids=${encodeURIComponent(compact.join(","))}`);
    return Array.isArray(res?.items) ? res.items : [];
  } catch {
    return [];
  }
}

function buildQuery(params: Record<string, string>) {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (!v) continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}
