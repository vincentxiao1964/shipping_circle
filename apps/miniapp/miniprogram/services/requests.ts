import { requestJson } from "./api";
import { getUserId } from "./auth";

export type RequestListItem = {
  id: string;
  ownerId: string;
  ownerDisplayName?: string;
  title: string;
  companyId?: string;
  companyName?: string;
  ownerContactChannel?: string;
  content: string;
  tags?: string[];
  status?: "open" | "closed";
  createdAt: number;
  priceHint?: { currency: string; min: number; max: number; count: number; updatedAt?: number } | null;
  quoteRange?: { currency: string; min: number; max: number; count: number } | null;
  introCount: number;
  isMine: boolean;
};

export type IntroductionItem = {
  id: string;
  requestId: string;
  introducerId: string;
  introducerDisplayName?: string;
  note: string;
  contactName?: string;
  contactTitle?: string;
  contactChannel?: string;
  clue?: string;
  createdAt: number;
  resolvedAt: number | null;
  outcome: "success" | "fail" | null;
};

export type RequestDetail = RequestListItem & {
  introductions: IntroductionItem[];
};

export type IntroducerRecommendItem = {
  id: string;
  displayName: string;
  score: number;
  successCount: number;
  points?: number;
  complaintCount?: number;
  claimExpiredCount?: number;
  claimNudgePenaltyCount?: number;
};

export type RequestClaimItem = {
  id: string;
  requestId: string;
  claimerId: string;
  claimerDisplayName?: string;
  status: "claimed" | "completed" | "complained" | "expired";
  createdAt: number;
  updatedAt?: number;
  acknowledgedAt?: number;
  nudgeCount?: number;
  lastNudgedAt?: number;
  expiredAt?: number;
  completedAt?: number;
  complainedAt?: number;
};

export type PageResult<T> = {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
};

type RequestDetailResponse = {
  item: RequestListItem;
  introductions: IntroductionItem[];
};

export type MyIntroductionListItem = {
  id: string;
  requestId: string;
  requestTitle: string;
  requestOwnerId: string;
  requestOwnerDisplayName: string;
  note: string;
  contactName?: string;
  contactTitle?: string;
  contactChannel?: string;
  clue?: string;
  createdAt: number;
  resolvedAt: number | null;
  outcome: "success" | "fail" | null;
  pointsAwarded: number;
};

export type TagCount = { tag: string; count: number };

export async function getRequest(id: string): Promise<RequestDetail | null> {
  const remote = await tryGetRemote(id);
  if (remote) return remote;
  return getLocal(id);
}

export async function createRequest(input: {
  title: string;
  companyId?: string;
  companyName: string;
  ownerContactChannel?: string;
  content: string;
  tags: string[];
}): Promise<RequestListItem> {
  try {
    const res = await requestJson<{ item: RequestListItem }>("POST", "/requests", input);
    return res.item;
  } catch {
    return createLocal(input);
  }
}

export async function updateRequest(input: {
  id: string;
  title: string;
  companyId?: string;
  companyName: string;
  ownerContactChannel?: string;
  content: string;
  tags: string[];
  status: "open" | "closed";
}): Promise<RequestListItem> {
  try {
    const res = await requestJson<{ item: RequestListItem }>("PUT", `/requests/${encodeURIComponent(input.id)}`, {
      title: input.title,
      companyId: input.companyId || "",
      companyName: input.companyName,
      ownerContactChannel: input.ownerContactChannel || "",
      content: input.content,
      tags: input.tags,
      status: input.status
    });
    return res.item;
  } catch {
    return updateLocal(input);
  }
}

export async function autoPingRequest(requestId: string, limit = 8): Promise<{ sent: number; duplicated: number } | null> {
  const id = requestId.trim();
  if (!id) return null;
  const n = Math.min(Math.max(1, Number(limit || 8)), 30);
  try {
    const res = await requestJson<{ ok: boolean; sent: number; duplicated: number }>("POST", `/requests/${encodeURIComponent(id)}/autoPing`, { limit: n });
    if (!res?.ok) return null;
    return { sent: Number(res.sent || 0), duplicated: Number(res.duplicated || 0) };
  } catch {
    return null;
  }
}

export async function submitIntroduction(input: {
  requestId: string;
  note?: string;
  contactName?: string;
  contactTitle?: string;
  contactChannel?: string;
  clue?: string;
}): Promise<IntroductionItem> {
  try {
    const res = await requestJson<{ item: IntroductionItem }>(
      "POST",
      `/requests/${encodeURIComponent(input.requestId)}/introductions`,
      {
        note: input.note || "",
        contactName: input.contactName || "",
        contactTitle: input.contactTitle || "",
        contactChannel: input.contactChannel || "",
        clue: input.clue || ""
      }
    );
    return res.item;
  } catch {
    return submitIntroLocal(input);
  }
}

export async function resolveIntroduction(input: {
  introId: string;
  outcome: "success" | "fail";
  reason?: string;
}): Promise<{ pointsAwarded: number } | null> {
  try {
    const res = await requestJson<{ item: { pointsAwarded: number } }>(
      "POST",
      `/introductions/${encodeURIComponent(input.introId)}/resolve`,
      { outcome: input.outcome, reason: input.reason || "" }
    );
    return res?.item ? { pointsAwarded: Number(res.item.pointsAwarded) } : null;
  } catch {
    return resolveIntroLocal(input);
  }
}

export async function listMyIntroductionsPage(input: { limit: number; cursor?: string }): Promise<PageResult<MyIntroductionListItem> | null> {
  try {
    const qs = buildQuery({ mine: "1", limit: String(input.limit), cursor: input.cursor || "" });
    const res = await requestJson<PageResult<MyIntroductionListItem>>("GET", `/introductions${qs}`);
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

export async function listRequestsPage(input: { limit: number; cursor?: string; mine?: boolean; tag?: string; company?: string }): Promise<PageResult<RequestListItem>> {
  const remote = await tryListRemotePage(input);
  if (remote) return remote;
  return listLocalPage(input);
}

export async function listPopularTags(input?: { limit?: number }): Promise<TagCount[]> {
  const limit = Math.min(Math.max(1, Number(input?.limit ?? 20)), 50);
  try {
    const qs = buildQuery({ scope: "requests", limit: String(limit) });
    const res = await requestJson<{ items: TagCount[] }>("GET", `/tags${qs}`);
    return Array.isArray(res?.items) ? res.items : [];
  } catch {
    return listLocalPopularTags(limit);
  }
}

export async function getRecommendedIntroducers(requestId: string, limit = 5): Promise<IntroducerRecommendItem[]> {
  const id = requestId.trim();
  if (!id) return [];
  try {
    const qs = buildQuery({ limit: String(limit) });
    const res = await requestJson<{ items: IntroducerRecommendItem[] }>("GET", `/requests/${encodeURIComponent(id)}/recommend-introducers${qs}`);
    return Array.isArray(res?.items) ? res.items : [];
  } catch {
    return [];
  }
}

export async function claimRequest(requestId: string): Promise<{ id: string; status: string } | null> {
  const id = requestId.trim();
  if (!id) return null;
  try {
    const res = await requestJson<{ ok: boolean; duplicated?: boolean; item?: { id: string; status: string } }>(
      "POST",
      `/requests/${encodeURIComponent(id)}/claim`,
      {}
    );
    if (!res?.ok || !res?.item?.id) return null;
    return { id: String(res.item.id), status: String(res.item.status || "") };
  } catch {
    return null;
  }
}

export async function listRequestClaims(requestId: string, mine?: boolean): Promise<RequestClaimItem[]> {
  const id = requestId.trim();
  if (!id) return [];
  try {
    const qs = buildQuery({ mine: mine ? "1" : "" });
    const res = await requestJson<{ items: RequestClaimItem[] }>("GET", `/requests/${encodeURIComponent(id)}/claims${qs}`);
    return Array.isArray(res?.items) ? res.items : [];
  } catch {
    return [];
  }
}

export async function completeRequestClaim(requestId: string, claimId: string): Promise<{ pointsAwarded: number } | null> {
  const rid = requestId.trim();
  const cid = claimId.trim();
  if (!rid || !cid) return null;
  try {
    const res = await requestJson<{ ok: boolean; pointsAwarded?: number }>(
      "POST",
      `/requests/${encodeURIComponent(rid)}/claims/${encodeURIComponent(cid)}/complete`,
      {}
    );
    if (!res?.ok) return null;
    return { pointsAwarded: Number(res.pointsAwarded || 0) };
  } catch {
    return null;
  }
}

export async function complainRequestClaim(requestId: string, claimId: string, reason: string): Promise<{ penaltyPoints: number } | null> {
  const rid = requestId.trim();
  const cid = claimId.trim();
  const rsn = String(reason || "").trim();
  if (!rid || !cid) return null;
  try {
    const res = await requestJson<{ ok: boolean; penaltyPoints?: number }>(
      "POST",
      `/requests/${encodeURIComponent(rid)}/claims/${encodeURIComponent(cid)}/complain`,
      { reason: rsn }
    );
    if (!res?.ok) return null;
    return { penaltyPoints: Number(res.penaltyPoints || 0) };
  } catch {
    return null;
  }
}

export async function ackRequestClaim(requestId: string, claimId: string): Promise<boolean> {
  const rid = requestId.trim();
  const cid = claimId.trim();
  if (!rid || !cid) return false;
  try {
    const res = await requestJson<{ ok: boolean }>("POST", `/requests/${encodeURIComponent(rid)}/claims/${encodeURIComponent(cid)}/ack`, {});
    return Boolean(res?.ok);
  } catch {
    return false;
  }
}

export async function nudgeRequestClaim(requestId: string, claimId: string): Promise<{ overdue: boolean; penaltyPoints: number; nudgeCount: number } | null> {
  const rid = requestId.trim();
  const cid = claimId.trim();
  if (!rid || !cid) return null;
  try {
    const res = await requestJson<{ ok: boolean; duplicated?: boolean; overdue?: boolean; penaltyPoints?: number; nudgeCount?: number }>(
      "POST",
      `/requests/${encodeURIComponent(rid)}/claims/${encodeURIComponent(cid)}/nudge`,
      {}
    );
    if (!res?.ok) return null;
    return { overdue: Boolean(res.overdue), penaltyPoints: Number(res.penaltyPoints || 0), nudgeCount: Number(res.nudgeCount || 0) };
  } catch {
    return null;
  }
}

export async function submitClaimQuote(requestId: string, claimId: string, quoteNote: string): Promise<boolean> {
  const rid = requestId.trim();
  const cid = claimId.trim();
  const note = String(quoteNote || "").trim();
  if (!rid || !cid || !note) return false;
  try {
    const res = await requestJson<{ ok: boolean }>("POST", `/requests/${encodeURIComponent(rid)}/claims/${encodeURIComponent(cid)}/quote`, {
      quoteNote: note
    });
    return Boolean(res?.ok);
  } catch {
    return false;
  }
}

export async function pingIntroducer(requestId: string, toUserId: string): Promise<{ duplicated: boolean } | null> {
  const id = requestId.trim();
  const uid = String(toUserId || "").trim();
  if (!id || !uid) return null;
  try {
    const res = await requestJson<{ ok: boolean; duplicated?: boolean }>("POST", `/requests/${encodeURIComponent(id)}/ping`, { toUserId: uid });
    if (!res?.ok) return null;
    return { duplicated: Boolean(res.duplicated) };
  } catch {
    return null;
  }
}

async function tryListRemotePage(input: { limit: number; cursor?: string; mine?: boolean; tag?: string; company?: string }): Promise<PageResult<RequestListItem> | null> {
  try {
    const qs = buildQuery({
      mine: input.mine ? "1" : "",
      includeClosed: input.mine ? "1" : "",
      tag: input.tag || "",
      company: input.company || "",
      limit: String(input.limit),
      cursor: input.cursor || ""
    });
    const res = await requestJson<PageResult<RequestListItem>>("GET", `/requests${qs}`);
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

async function tryGetRemote(id: string): Promise<RequestDetail | null> {
  try {
    const res = await requestJson<RequestDetailResponse>("GET", `/requests/${encodeURIComponent(id)}`);
    if (!res?.item) return null;
    return {
      ...res.item,
      introductions: Array.isArray(res.introductions) ? res.introductions : []
    };
  } catch {
    return null;
  }
}

type LocalRequest = {
  id: string;
  ownerId: string;
  title: string;
  companyId?: string;
  companyName?: string;
  ownerContactChannel?: string;
  content: string;
  tags?: string[];
  status?: "open" | "closed";
  createdAt: number;
  introductions: IntroductionItem[];
};

const STORAGE_KEY = "sc_requests_v1";

function createLocal(input: {
  title: string;
  companyId?: string;
  companyName: string;
  ownerContactChannel?: string;
  content: string;
  tags: string[];
}): RequestListItem {
  const me = getUserId() ?? "u_local";
  const all = readAll();
  const reqItem: LocalRequest = {
    id: `r_local_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    ownerId: me,
    title: input.title || "Untitled",
    companyId: input.companyId ? String(input.companyId) : "",
    companyName: input.companyName,
    ownerContactChannel: input.ownerContactChannel ? String(input.ownerContactChannel) : "",
    content: input.content,
    tags: input.tags,
    status: "open",
    createdAt: Date.now(),
    introductions: []
  };
  all.unshift(reqItem);
  writeAll(all);
  return {
    id: reqItem.id,
    ownerId: reqItem.ownerId,
    ownerDisplayName: reqItem.ownerId,
    title: reqItem.title,
    companyId: reqItem.companyId || "",
    companyName: reqItem.companyName || "",
    ownerContactChannel: reqItem.ownerContactChannel || "",
    content: reqItem.content,
    tags: Array.isArray(reqItem.tags) ? reqItem.tags : [],
    status: reqItem.status || "open",
    createdAt: reqItem.createdAt,
    introCount: 0,
    isMine: true
  };
}

function updateLocal(input: {
  id: string;
  title: string;
  companyId?: string;
  companyName: string;
  ownerContactChannel?: string;
  content: string;
  tags: string[];
  status: "open" | "closed";
}): RequestListItem {
  const me = getUserId() ?? "";
  const all = readAll();
  const r = all.find((x) => x.id === input.id);
  if (!r) throw new Error("Not Found");
  if (me && r.ownerId !== me) throw new Error("Forbidden");
  r.title = input.title || r.title;
  r.companyId = input.companyId ? String(input.companyId) : "";
  r.companyName = input.companyName;
  r.ownerContactChannel = input.ownerContactChannel ? String(input.ownerContactChannel) : r.ownerContactChannel || "";
  r.content = input.content || r.content;
  r.tags = input.tags;
  r.status = input.status;
  writeAll(all);
  return {
    id: r.id,
    ownerId: r.ownerId,
    ownerDisplayName: r.ownerId,
    title: r.title,
    companyId: r.companyId || "",
    companyName: r.companyName || "",
    ownerContactChannel: r.ownerContactChannel || "",
    content: r.content,
    tags: Array.isArray(r.tags) ? r.tags : [],
    status: r.status || "open",
    createdAt: r.createdAt,
    introCount: r.introductions.length,
    isMine: me ? r.ownerId === me : false
  };
}

function submitIntroLocal(input: {
  requestId: string;
  note?: string;
  contactName?: string;
  contactTitle?: string;
  contactChannel?: string;
  clue?: string;
}): IntroductionItem {
  const me = getUserId() ?? "u_local";
  const all = readAll();
  const r = all.find((x) => x.id === input.requestId);
  if (!r) throw new Error("Not Found");
  if (r.status === "closed") throw new Error("request closed");
  if (r.ownerId === me) throw new Error("cannot introduce for own request");
  if (r.introductions.some((i) => i.introducerId === me)) throw new Error("already introduced");
  const note = String(input.note || "").trim() || buildIntroNote(input);
  if (!note) throw new Error("note required");
  const intro: IntroductionItem = {
    id: `i_local_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    requestId: r.id,
    introducerId: me,
    introducerDisplayName: me,
    note,
    contactName: String(input.contactName || "").trim(),
    contactTitle: String(input.contactTitle || "").trim(),
    contactChannel: String(input.contactChannel || "").trim(),
    clue: String(input.clue || "").trim(),
    createdAt: Date.now(),
    resolvedAt: null,
    outcome: null
  };
  r.introductions.unshift(intro);
  writeAll(all);
  return intro;
}

function buildIntroNote(input: { contactName?: string; contactTitle?: string; contactChannel?: string; clue?: string }) {
  const contactName = String(input.contactName || "").trim();
  const contactTitle = String(input.contactTitle || "").trim();
  const contactChannel = String(input.contactChannel || "").trim();
  const clue = String(input.clue || "").trim();
  const parts: string[] = [];
  if (contactName) parts.push(`联系人：${contactName}`);
  if (contactTitle) parts.push(`岗位/部门：${contactTitle}`);
  if (contactChannel) parts.push(`联系方式：${contactChannel}`);
  if (clue) parts.push(`线索：${clue}`);
  return parts.join("\n");
}

function resolveIntroLocal(input: { introId: string; outcome: "success" | "fail"; reason?: string }): { pointsAwarded: number } | null {
  const me = getUserId() ?? "";
  if (!me) return null;
  const all = readAll();
  const r = all.find((req) => req.introductions.some((i) => i.id === input.introId));
  if (!r) return null;
  if (r.ownerId !== me) return null;
  const intro = r.introductions.find((i) => i.id === input.introId);
  if (!intro || intro.resolvedAt) return null;
  intro.outcome = input.outcome;
  intro.resolvedAt = Date.now();
  writeAll(all);
  return { pointsAwarded: input.outcome === "success" ? 5 : 1 };
}

function listLocalPage(input: { limit: number; cursor?: string; mine?: boolean; tag?: string; company?: string }): PageResult<RequestListItem> {
  const me = getUserId() ?? "";
  const limit = Math.min(Math.max(1, input.limit), 50);
  const base = input.mine && me ? readAll().filter((r) => r.ownerId === me) : readAll();
  const visible = input.mine ? base : base.filter((r) => r.status !== "closed");
  const byTag = input.tag ? visible.filter((r) => Array.isArray(r.tags) && r.tags.includes(input.tag!)) : visible;
  const filtered = input.company ? byTag.filter((r) => String(r.companyName || "").toLowerCase().includes(input.company!.toLowerCase())) : byTag;
  const all = filtered.sort((a, b) => b.createdAt - a.createdAt);

  let startIndex = 0;
  const cursor = input.cursor || "";
  if (cursor) {
    const idx = all.findIndex((p) => p.id === cursor);
    if (idx >= 0) startIndex = idx + 1;
  }
  const page = all.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < all.length;
  const nextCursor = hasMore && page.length > 0 ? page[page.length - 1].id : null;

  const items: RequestListItem[] = page.map((r) => ({
    id: r.id,
    ownerId: r.ownerId,
    ownerDisplayName: r.ownerId,
    title: r.title,
    companyId: r.companyId || "",
    companyName: r.companyName || "",
    content: r.content,
    tags: Array.isArray(r.tags) ? r.tags : [],
    status: r.status || "open",
    createdAt: r.createdAt,
    introCount: r.introductions.length,
    isMine: me ? r.ownerId === me : false
  }));
  return { items, nextCursor, hasMore };
}

function getLocal(id: string): RequestDetail | null {
  const me = getUserId() ?? "";
  const r = readAll().find((x) => x.id === id);
  if (!r) return null;
  return {
    id: r.id,
    ownerId: r.ownerId,
    ownerDisplayName: r.ownerId,
    title: r.title,
    companyId: r.companyId || "",
    companyName: r.companyName || "",
    content: r.content,
    tags: Array.isArray(r.tags) ? r.tags : [],
    status: r.status || "open",
    createdAt: r.createdAt,
    introCount: r.introductions.length,
    isMine: me ? r.ownerId === me : false,
    introductions: r.introductions
  };
}

function readAll(): LocalRequest[] {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return seed();
    return parsed;
  } catch {
    return seed();
  }
}

function writeAll(items: LocalRequest[]) {
  try {
    wx.setStorageSync(STORAGE_KEY, JSON.stringify(items));
  } catch {}
}

function seed(): LocalRequest[] {
  const now = Date.now();
  const items: LocalRequest[] = [
    {
      id: "r_seed_1",
      ownerId: "system",
      title: "找航线资源 / Looking for route resource",
      companyName: "",
      content: "需要介绍：东南亚航线一手资源或靠谱同行。\n请直接留言你能引荐的对象/领域。",
      tags: ["航线资源"],
      status: "open",
      createdAt: now - 120_000,
      introductions: []
    }
  ];
  try {
    wx.setStorageSync(STORAGE_KEY, JSON.stringify(items));
  } catch {}
  return items;
}

function listLocalPopularTags(limit: number): TagCount[] {
  const map = new Map<string, number>();
  const all = readAll().filter((r) => r.status !== "closed");
  for (const r of all) {
    if (!Array.isArray(r.tags)) continue;
    for (const tag of r.tags) {
      const k = String(tag || "").trim();
      if (!k) continue;
      map.set(k, (map.get(k) || 0) + 1);
    }
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }));
}

function buildQuery(params: Record<string, string>) {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (!String(v || "").trim()) continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}
