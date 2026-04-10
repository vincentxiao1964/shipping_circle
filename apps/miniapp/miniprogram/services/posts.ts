import { getUserId } from "./auth";
import { requestJson } from "./api";
import { getIsFollowing } from "./follows";

export type Comment = {
  id: string;
  authorId: string;
  content: string;
  createdAt: number;
};

export type PostListItem = {
  id: string;
  authorId: string;
  authorDisplayName?: string;
  title: string;
  content: string;
  createdAt: number;
  commentCount: number;
  likeCount: number;
  likedByMe: boolean;
};

export type PostDetail = {
  id: string;
  authorId: string;
  authorDisplayName?: string;
  title: string;
  content: string;
  createdAt: number;
  comments: Comment[];
  likeCount: number;
  likedByMe: boolean;
  authorFollowedByMe: boolean;
};

type ToggleLikeResult = {
  liked: boolean;
  likeCount: number;
};

export type FeedType = "all" | "following";

export type PostListPage = {
  items: PostListItem[];
  nextCursor: string | null;
  hasMore: boolean;
};

type PostRecord = {
  id: string;
  authorId: string;
  title: string;
  content: string;
  createdAt: number;
  comments: Comment[];
  likeUserIds: string[];
};

const STORAGE_KEY = "sc_posts_v1";

export async function listPosts(): Promise<PostListItem[]> {
  const page = await listPostsPage({ feed: "all", limit: 50 });
  return page.items;
}

export async function getPost(id: string): Promise<PostDetail | null> {
  const remote = await tryGetRemote(id);
  if (remote) return remote;
  return getLocal(id);
}

export async function createPost(input: { title: string; content: string }): Promise<PostDetail> {
  const remote = await tryCreateRemote(input);
  if (remote) return remote;
  return createLocal(input);
}

export async function addComment(postId: string, content: string): Promise<Comment> {
  const remote = await tryAddCommentRemote(postId, content);
  if (remote) return remote;
  return addCommentLocal(postId, content);
}

export async function toggleLike(postId: string): Promise<ToggleLikeResult> {
  const remote = await tryToggleLikeRemote(postId);
  if (remote) return remote;
  return toggleLikeLocal(postId);
}

export async function listPostsPage(input: { feed: FeedType; limit: number; cursor?: string; authorId?: string }): Promise<PostListPage> {
  const remote = await tryListRemotePage(input);
  if (remote) return remote;
  return listLocalPage(input);
}

function listLocalPage(input: { feed: FeedType; limit: number; cursor?: string; authorId?: string }): PostListPage {
  const me = getUserId() ?? "";
  const limit = Math.min(Math.max(1, input.limit), 50);
  let list = readAll().sort((a, b) => b.createdAt - a.createdAt);
  if (input.feed === "following") list = list.filter((p) => p.authorId && getIsFollowing(p.authorId));
  if (input.authorId) list = list.filter((p) => p.authorId === input.authorId);

  let startIndex = 0;
  const cursor = input.cursor || "";
  if (cursor) {
    const idx = list.findIndex((p) => p.id === cursor);
    if (idx >= 0) startIndex = idx + 1;
  }

  const page = list.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < list.length;
  const nextCursor = hasMore && page.length > 0 ? page[page.length - 1].id : null;

  const items = page.map((p) => ({
    id: p.id,
    authorId: p.authorId,
    authorDisplayName: p.authorId,
    title: p.title,
    content: p.content,
    createdAt: p.createdAt,
    commentCount: p.comments.length,
    likeCount: p.likeUserIds.length,
    likedByMe: me ? p.likeUserIds.includes(me) : false
  }));
  return { items, nextCursor, hasMore };
}

function getLocal(id: string): PostDetail | null {
  const me = getUserId() ?? "";
  const posts = readAll();
  const post = posts.find((p) => p.id === id);
  if (!post) return null;
  return {
    id: post.id,
    authorId: post.authorId,
    authorDisplayName: post.authorId,
    title: post.title,
    content: post.content,
    createdAt: post.createdAt,
    comments: post.comments,
    likeCount: post.likeUserIds.length,
    likedByMe: me ? post.likeUserIds.includes(me) : false,
    authorFollowedByMe: post.authorId ? getIsFollowing(post.authorId) : false
  };
}

function createLocal(input: { title: string; content: string }): PostDetail {
  const authorId = getUserId() ?? "anonymous";
  const now = Date.now();
  const post: PostRecord = {
    id: `p_${now}_${Math.random().toString(16).slice(2)}`,
    authorId,
    title: input.title.trim(),
    content: input.content.trim(),
    createdAt: now,
    comments: [],
    likeUserIds: []
  };
  const posts = readAll();
  posts.unshift(post);
  writeAll(posts);
  return {
    id: post.id,
    authorId: post.authorId,
    authorDisplayName: post.authorId,
    title: post.title,
    content: post.content,
    createdAt: post.createdAt,
    comments: post.comments,
    likeCount: 0,
    likedByMe: false,
    authorFollowedByMe: false
  };
}

function addCommentLocal(postId: string, content: string): Comment {
  const authorId = getUserId() ?? "anonymous";
  const now = Date.now();
  const comment: Comment = {
    id: `c_${now}_${Math.random().toString(16).slice(2)}`,
    authorId,
    content: content.trim(),
    createdAt: now
  };

  const posts = readAll();
  const idx = posts.findIndex((p) => p.id === postId);
  if (idx < 0) throw new Error("post not found");
  posts[idx].comments.push(comment);
  writeAll(posts);
  return comment;
}

function toggleLikeLocal(postId: string): ToggleLikeResult {
  const me = getUserId() ?? "";
  if (!me) throw new Error("not authed");
  const posts = readAll();
  const idx = posts.findIndex((p) => p.id === postId);
  if (idx < 0) throw new Error("post not found");
  const post = posts[idx];
  const exists = post.likeUserIds.includes(me);
  if (exists) post.likeUserIds = post.likeUserIds.filter((u) => u !== me);
  else post.likeUserIds.push(me);
  writeAll(posts);
  return { liked: !exists, likeCount: post.likeUserIds.length };
}

async function tryListRemotePage(input: { feed: FeedType; limit: number; cursor?: string; authorId?: string }): Promise<PostListPage | null> {
  try {
    const qs = buildQuery({
      feed: input.feed,
      authorId: input.authorId || "",
      limit: String(input.limit),
      cursor: input.cursor || ""
    });
    const res = await requestJson<PostListPage>("GET", `/posts${qs}`);
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

async function tryGetRemote(id: string): Promise<PostDetail | null> {
  try {
    const res = await requestJson<{ item: PostDetail }>("GET", `/posts/${encodeURIComponent(id)}`);
    if (!res?.item) return null;
    return res.item;
  } catch {
    return null;
  }
}

async function tryCreateRemote(input: { title: string; content: string }): Promise<PostDetail | null> {
  try {
    const res = await requestJson<{ item: PostDetail }>("POST", "/posts", {
      title: input.title,
      content: input.content
    });
    if (!res?.item) return null;
    return res.item;
  } catch {
    return null;
  }
}

async function tryAddCommentRemote(postId: string, content: string): Promise<Comment | null> {
  try {
    const res = await requestJson<{ item: Comment }>("POST", `/posts/${encodeURIComponent(postId)}/comments`, { content });
    if (!res?.item) return null;
    return res.item;
  } catch {
    return null;
  }
}

async function tryToggleLikeRemote(postId: string): Promise<ToggleLikeResult | null> {
  try {
    const res = await requestJson<ToggleLikeResult>("POST", `/posts/${encodeURIComponent(postId)}/like`, {});
    if (typeof res?.liked !== "boolean" || typeof res?.likeCount !== "number") return null;
    return res;
  } catch {
    return null;
  }
}

function readAll(): PostRecord[] {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(String(raw)) as unknown;
    if (!Array.isArray(parsed)) return seed();
    const normalized = parsed.map((p: any) => ({
      id: String(p.id || ""),
      authorId: String(p.authorId || ""),
      title: String(p.title || ""),
      content: String(p.content || ""),
      createdAt: Number(p.createdAt || 0),
      comments: Array.isArray(p.comments) ? (p.comments as Comment[]) : [],
      likeUserIds: Array.isArray(p.likeUserIds) ? (p.likeUserIds as string[]) : []
    }));
    return normalized.filter((p: PostRecord) => p.id);
  } catch {
    return seed();
  }
}

function writeAll(posts: PostRecord[]) {
  wx.setStorageSync(STORAGE_KEY, JSON.stringify(posts));
}

function buildQuery(params: Record<string, string>) {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (!v) continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

function seed(): PostRecord[] {
  const now = Date.now();
  const posts: PostRecord[] = [
    {
      id: "p_seed_1",
      authorId: "system",
      title: "Welcome / 欢迎",
      content: "Shipping Circle MVP is ready. Create your first post.\n海运圈 MVP 已就绪，试试发第一条帖子。",
      createdAt: now - 60_000,
      comments: [],
      likeUserIds: []
    }
  ];
  writeAll(posts);
  return posts;
}
