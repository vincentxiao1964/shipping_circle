import { requestJson } from "./api";

export type CompanyRole = {
  business: string;
  title: string;
};

export type CompanyListItem = {
  id: string;
  name: string;
  region: string;
  tags: string[];
  roleCount: number;
  roles: CompanyRole[];
  followerCount?: number;
  followedByMe?: boolean;
  createdAt: number;
};

export type CompanyDetail = {
  id: string;
  name: string;
  region: string;
  tags: string[];
  roles: CompanyRole[];
  followerCount?: number;
  followedByMe?: boolean;
  createdAt: number;
};

export type PageResult<T> = {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
};

const STORAGE_KEY = "sc_companies_v1";
const STORAGE_FOLLOWS_KEY = "sc_company_follows_v1";

export async function listCompaniesPage(input: { q: string; limit: number; cursor?: string }): Promise<PageResult<CompanyListItem>> {
  const remote = await tryListRemote(input);
  if (remote) return remote;
  return listLocal(input);
}

export async function getCompany(id: string): Promise<CompanyDetail | null> {
  try {
    const res = await requestJson<{ item: CompanyDetail }>("GET", `/companies/${encodeURIComponent(id)}`);
    return res?.item ?? null;
  } catch {
    return getLocal(id);
  }
}

export async function resolveCompanyByName(name: string): Promise<{ id: string; name: string } | null> {
  const n = String(name || "").trim();
  if (!n) return null;
  try {
    const res = await requestJson<{ item: { id: string; name: string } }>("GET", `/companies/resolve?name=${encodeURIComponent(n)}`);
    if (!res?.item?.id) return null;
    return { id: String(res.item.id), name: String(res.item.name || "") };
  } catch {
    return null;
  }
}

export async function createCompany(input: { name: string; region: string; tags: string[]; roles: CompanyRole[] }): Promise<CompanyDetail> {
  try {
    const res = await requestJson<{ item: CompanyDetail }>("POST", "/companies", input);
    return res.item;
  } catch {
    return createLocal(input);
  }
}

export async function addCompanyAlias(companyId: string, alias: string): Promise<{ ok: boolean; conflict?: boolean } | null> {
  const id = String(companyId || "").trim();
  const a = String(alias || "").trim();
  if (!id || !a) return null;
  try {
    await requestJson("POST", `/companies/${encodeURIComponent(id)}/aliases`, { alias: a });
    return { ok: true };
  } catch (e) {
    const statusCode = (e as any)?.statusCode as number | undefined;
    if (statusCode === 409) {
      return { ok: false, conflict: true };
    }
    return null;
  }
}

export async function toggleCompanyFollow(companyId: string): Promise<{ following: boolean; followerCount: number } | null> {
  const id = companyId.trim();
  if (!id) return null;
  try {
    const res = await requestJson<{ following: boolean; followerCount: number }>("POST", `/companies/${encodeURIComponent(id)}/follow`);
    return { following: Boolean(res.following), followerCount: Number(res.followerCount || 0) };
  } catch {
    return toggleLocalFollow(id);
  }
}

export async function listMyFollowedCompaniesPage(input: { limit: number; cursor?: string }): Promise<PageResult<CompanyListItem> | null> {
  try {
    const qs = buildQuery({ limit: String(input.limit), cursor: input.cursor || "" });
    const res = await requestJson<PageResult<CompanyListItem>>("GET", `/companies/me/following${qs}`);
    if (!res || !Array.isArray(res.items)) return null;
    return {
      items: res.items,
      nextCursor: typeof res.nextCursor === "string" ? res.nextCursor : null,
      hasMore: Boolean(res.hasMore)
    };
  } catch {
    return listLocalFollowed(input);
  }
}

async function tryListRemote(input: { q: string; limit: number; cursor?: string }): Promise<PageResult<CompanyListItem> | null> {
  try {
    const qs = buildQuery({ q: input.q, limit: String(input.limit), cursor: input.cursor || "" });
    const res = await requestJson<PageResult<CompanyListItem>>("GET", `/companies${qs}`);
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

type LocalCompany = CompanyDetail;

function listLocal(input: { q: string; limit: number; cursor?: string }): PageResult<CompanyListItem> {
  const limit = Math.min(Math.max(1, input.limit), 50);
  const q = (input.q || "").trim().toLowerCase();
  const base = readAll().slice().sort((a, b) => b.createdAt - a.createdAt);
  const filtered = q
    ? base.filter((c) => {
        if (String(c.name || "").toLowerCase().includes(q)) return true;
        if (String(c.region || "").toLowerCase().includes(q)) return true;
        if (Array.isArray(c.tags) && c.tags.some((t) => String(t || "").toLowerCase().includes(q))) return true;
        if (Array.isArray(c.roles) && c.roles.some((r) => String(r.business || "").toLowerCase().includes(q))) return true;
        return false;
      })
    : base;

  let startIndex = 0;
  const cursor = input.cursor || "";
  if (cursor) {
    const idx = filtered.findIndex((p) => p.id === cursor);
    if (idx >= 0) startIndex = idx + 1;
  }
  const page = filtered.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < filtered.length;
  const nextCursor = hasMore && page.length > 0 ? page[page.length - 1].id : null;
  const items: CompanyListItem[] = page.map((c) => ({
    id: c.id,
    name: c.name,
    region: c.region,
    tags: Array.isArray(c.tags) ? c.tags : [],
    roleCount: Array.isArray(c.roles) ? c.roles.length : 0,
    roles: Array.isArray(c.roles) ? c.roles.slice(0, 3) : [],
    createdAt: c.createdAt
  }));
  return { items, nextCursor, hasMore };
}

function getLocal(id: string): CompanyDetail | null {
  const c = readAll().find((x) => x.id === id);
  return c ?? null;
}

function createLocal(input: { name: string; region: string; tags: string[]; roles: CompanyRole[] }): CompanyDetail {
  const all = readAll();
  const item: CompanyDetail = {
    id: `c_local_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    name: input.name,
    region: input.region,
    tags: input.tags,
    roles: input.roles,
    createdAt: Date.now()
  };
  all.unshift(item);
  writeAll(all);
  return item;
}

function readAll(): LocalCompany[] {
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

function writeAll(items: LocalCompany[]) {
  try {
    wx.setStorageSync(STORAGE_KEY, JSON.stringify(items));
  } catch {}
}

function seed(): LocalCompany[] {
  const now = Date.now();
  const items: LocalCompany[] = [
    {
      id: "c_seed_1",
      name: "示例公司 / Demo Co.",
      region: "Shanghai",
      tags: ["订舱", "东南亚"],
      roles: [
        { business: "订舱", title: "负责人" },
        { business: "拖车", title: "负责人" }
      ],
      createdAt: now - 180_000
    }
  ];
  writeAll(items);
  return items;
}

function toggleLocalFollow(companyId: string): { following: boolean; followerCount: number } | null {
  const id = companyId.trim();
  if (!id) return null;
  const set = readLocalFollows();
  if (set.has(id)) set.delete(id);
  else set.add(id);
  writeLocalFollows(set);
  return { following: set.has(id), followerCount: 0 };
}

function listLocalFollowed(input: { limit: number; cursor?: string }): PageResult<CompanyListItem> | null {
  const set = readLocalFollows();
  const ids = Array.from(set.values());
  const base = readAll()
    .filter((c) => ids.includes(c.id))
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt);

  const limit = Math.min(Math.max(1, input.limit), 50);
  let startIndex = 0;
  const cursor = input.cursor || "";
  if (cursor) {
    const idx = base.findIndex((p) => p.id === cursor);
    if (idx >= 0) startIndex = idx + 1;
  }
  const page = base.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < base.length;
  const nextCursor = hasMore && page.length > 0 ? page[page.length - 1].id : null;
  const items: CompanyListItem[] = page.map((c) => ({
    id: c.id,
    name: c.name,
    region: c.region,
    tags: Array.isArray(c.tags) ? c.tags : [],
    roleCount: Array.isArray(c.roles) ? c.roles.length : 0,
    roles: Array.isArray(c.roles) ? c.roles.slice(0, 3) : [],
    followerCount: 0,
    followedByMe: true,
    createdAt: c.createdAt
  }));
  return { items, nextCursor, hasMore };
}

function readLocalFollows(): Set<string> {
  try {
    const raw = wx.getStorageSync(STORAGE_FOLLOWS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map((x) => String(x || "").trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

function writeLocalFollows(set: Set<string>) {
  try {
    wx.setStorageSync(STORAGE_FOLLOWS_KEY, JSON.stringify(Array.from(set.values())));
  } catch {}
}

function buildQuery(params: Record<string, string>) {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (!String(v || "").trim()) continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}
