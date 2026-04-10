import { requestJson } from "./api";
import type { PostListItem } from "./posts";
import type { UserProfile } from "./users";

export type PageResult<T> = {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
};

export async function searchPostsPage(input: { q: string; limit: number; cursor?: string }): Promise<PageResult<PostListItem> | null> {
  try {
    const qs = buildQuery({
      type: "posts",
      q: input.q,
      limit: String(input.limit),
      cursor: input.cursor || ""
    });
    const res = await requestJson<PageResult<PostListItem>>("GET", `/search${qs}`);
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

export async function searchUsersPage(input: { q: string; limit: number; cursor?: string }): Promise<PageResult<UserProfile> | null> {
  try {
    const qs = buildQuery({
      type: "users",
      q: input.q,
      limit: String(input.limit),
      cursor: input.cursor || ""
    });
    const res = await requestJson<PageResult<UserProfile>>("GET", `/search${qs}`);
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

function buildQuery(params: Record<string, string>) {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (!String(v || "").trim()) continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

