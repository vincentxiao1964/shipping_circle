import http from "node:http";
import { randomUUID } from "node:crypto";
import { initStore, markDirty } from "./store.js";

const PORT = Number(process.env.PORT || 8787);

const store = initStore();
const tokenToUser = store.tokenToUser;
const tokenMeta = store.tokenMeta;
const userTokens = store.userTokens;
const users = store.users;
const userStats = store.userStats;
const posts = store.posts;
const requests = store.requests;
const introductions = store.introductions;
const contacts = store.contacts;
const companies = store.companies;
const companyFollows = store.companyFollows;
const notifications = store.notifications;
const follows = store.follows;
const MAX_PORT_TRIES = 20;
const TOKEN_TTL_MS = Number(process.env.TOKEN_TTL_MS || 30 * 24 * 60 * 60 * 1000);
const REFRESH_GRACE_MS = Number(process.env.REFRESH_GRACE_MS || 24 * 60 * 60 * 1000);
const CONTACT_STALE_MS = Number(process.env.CONTACT_STALE_MS || 90 * 24 * 60 * 60 * 1000);
const CONTACT_ENDORSE_VERIFY_N = Number(process.env.CONTACT_ENDORSE_VERIFY_N || 2);
const ADMIN_KEY = String(process.env.ADMIN_KEY || "").trim();

const server = http.createServer(async (req, res) => {
  setCors(res);

  if (!req.url) return json(res, 400, { error: "Bad Request" });
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/") {
    return json(res, 200, {
      name: "shipping-circle-api",
      ok: true,
      endpoints: [
        "GET /health",
        "POST /auth/wechat",
        "POST /auth/refresh",
        "POST /auth/logout",
        "GET /companies",
        "POST /companies",
        "GET /companies/:id",
        "GET /companies/resolve?name=...",
        "POST /companies/:id/aliases",
        "POST /companies/:id/follow",
        "GET /companies/me/following",
        "GET /contacts/match",
        "GET /contacts/list?companyId=...",
        "POST /contacts/:id/endorse",
        "POST /contacts/:id/feedback",
        "POST /contacts/batchFeedback",
        "POST /contacts/batchUpdate",
        "PUT /admin/companies/:id/aliases",
        "POST /admin/companies/merge",
        "POST /admin/normalizeChannels",
        "GET /requests",
        "POST /requests",
        "GET /requests/:id",
        "PUT /requests/:id",
        "GET /requests/:id/recommend-introducers",
        "POST /requests/:id/ping",
        "POST /requests/:id/introductions",
        "GET /tags",
        "GET /introductions",
        "POST /introductions/:id/resolve",
        "GET /posts",
        "POST /posts",
        "GET /posts/:id",
        "POST /posts/:id/like",
        "POST /posts/:id/comments",
        "GET /search",
        "POST /users/:id/follow",
        "GET /users/me",
        "PUT /users/me",
        "GET /users/me/following",
        "GET /users/:id",
        "GET /users/:id/stats",
        "GET /users/:id/followers",
        "GET /users/:id/following",
        "GET /users?ids=...",
        "GET /notifications",
        "POST /notifications/:id/read",
        "POST /notifications/read-all"
      ]
    });
  }

  if (req.method === "GET" && url.pathname === "/favicon.ico") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && url.pathname === "/auth/wechat") {
    markDirty();
    const body = await readJson(req).catch(() => null);
    const code = body?.code;
    if (!code || typeof code !== "string") return json(res, 400, { error: "code required" });

    const openid = await getWeChatOpenId(code);
    const userId = `u_${hash(openid)}`;
    revokeAllUserTokens(userId, tokenToUser, tokenMeta, userTokens);
    const { token, expiresAt } = issueTokenForUser(userId);
    ensureUser(userId, { openid });
    if (!follows.has(userId)) follows.set(userId, new Set());
    notifications.push({
      id: `n_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      toUserId: userId,
      type: "system",
      title: "Welcome / 欢迎",
      content: "You are signed in.\n你已登录。",
      createdAt: Date.now(),
      readAt: null,
      data: {}
    });

    return json(res, 200, {
      token,
      expiresAt,
      user: { id: userId, displayName: users.get(userId).displayName }
    });
  }

  if (req.method === "POST" && url.pathname === "/auth/refresh") {
    const token = getAuthToken(req);
    if (!token) return json(res, 401, { error: "Unauthorized" });
    const meta = tokenMeta.get(token);
    const userId = meta?.userId || tokenToUser.get(token) || null;
    if (!userId || !meta) return json(res, 401, { error: "Unauthorized" });
    const now = Date.now();
    const expiresAt = typeof meta.expiresAt === "number" ? meta.expiresAt : 0;
    if (expiresAt && now > expiresAt + REFRESH_GRACE_MS) return json(res, 401, { error: "Unauthorized" });
    revokeToken(token, tokenToUser, tokenMeta, userTokens);
    const next = issueTokenForUser(userId);
    return json(res, 200, { token: next.token, expiresAt: next.expiresAt });
  }

  if (req.method === "POST" && url.pathname === "/auth/logout") {
    const token = getAuthToken(req);
    const userId = getAuthUserId(req, tokenToUser, tokenMeta, userTokens);
    if (!userId || !token) return json(res, 401, { error: "Unauthorized" });
    revokeToken(token, tokenToUser, tokenMeta, userTokens);
    return json(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/users/me") {
    const userId = getAuthUserId(req, tokenToUser, tokenMeta, userTokens);
    if (!userId) return json(res, 401, { error: "Unauthorized" });
    const u = ensureUser(userId);
    return json(res, 200, {
      item: {
        id: u.id,
        displayName: u.displayName,
        companyId: u.companyId || "",
        companyName: u.companyName || "",
        businesses: Array.isArray(u.businesses) ? u.businesses : [],
        title: u.title || "",
        contactChannel: u.contactChannel || "",
        contactVisibility: u.contactVisibility || "loggedIn"
      }
    });
  }

  if (req.method === "PUT" && url.pathname === "/users/me") {
    const userId = getAuthUserId(req, tokenToUser, tokenMeta, userTokens);
    if (!userId) return json(res, 401, { error: "Unauthorized" });
    const body = await readJson(req).catch(() => null);
    const displayName = typeof body?.displayName === "string" ? body.displayName.trim() : "";
    const companyId = typeof body?.companyId === "string" ? body.companyId.trim() : "";
    const companyName = typeof body?.companyName === "string" ? body.companyName.trim() : "";
    const businesses = Array.isArray(body?.businesses)
      ? body.businesses.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 20)
      : [];
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const contactChannelRaw = typeof body?.contactChannel === "string" ? body.contactChannel.trim() : "";
    const contactChannel = contactChannelRaw ? (canonicalizeContactChannel(contactChannelRaw)?.display || contactChannelRaw) : "";
    const contactVisibility = typeof body?.contactVisibility === "string" ? body.contactVisibility.trim() : "";
    if (!displayName) return json(res, 400, { error: "displayName required" });
    const u = ensureUser(userId);
    markDirty();
    u.displayName = displayName.slice(0, 40);
    const companyFromId = companyId ? companies.find((x) => x.id === companyId) : null;
    const companyFromName =
      !companyFromId && companyName
        ? companies.find((x) => normalizeCompany(x?.name || "") === normalizeCompany(companyName)) ||
          companies.find((x) => Array.isArray(x?.aliases) && x.aliases.some((a) => normalizeCompany(a) === normalizeCompany(companyName)))
        : null;
    const finalCompany = companyFromId || companyFromName;
    u.companyId = finalCompany ? finalCompany.id : "";
    u.companyName = finalCompany ? finalCompany.name : companyName.slice(0, 120);
    u.businesses = businesses;
    u.title = title.slice(0, 120);
    u.contactChannel = contactChannel.slice(0, 200);
    if (contactVisibility === "loggedIn" || contactVisibility === "mutual" || contactVisibility === "private") {
      u.contactVisibility = contactVisibility;
    } else if (!u.contactVisibility) {
      u.contactVisibility = "loggedIn";
    }
    users.set(userId, u);
    upsertSelfClaimedContactsFromUser(u);
    return json(res, 200, {
      item: {
        id: u.id,
        displayName: u.displayName,
        companyId: u.companyId || "",
        companyName: u.companyName || "",
        businesses: Array.isArray(u.businesses) ? u.businesses : [],
        title: u.title || "",
        contactChannel: u.contactChannel || "",
        contactVisibility: u.contactVisibility || "loggedIn"
      }
    });
  }

  if (req.method === "GET" && url.pathname === "/users") {
    const idsParam = String(url.searchParams.get("ids") || "");
    const ids = idsParam
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 50);
    const items = ids.map((id) => {
      const u = ensureUser(id);
      return { id: u.id, displayName: u.displayName };
    });
    return json(res, 200, { items });
  }

  const userMatch = url.pathname.match(/^\/users\/([^/]+)$/);
  if (req.method === "GET" && userMatch) {
    const id = decodeURIComponent(userMatch[1]);
    if (!id) return json(res, 400, { error: "id required" });
    const u = ensureUser(id);
    return json(res, 200, { item: { id: u.id, displayName: u.displayName } });
  }

  const userStatsMatch = url.pathname.match(/^\/users\/([^/]+)\/stats$/);
  if (req.method === "GET" && userStatsMatch) {
    const id = decodeURIComponent(userStatsMatch[1]);
    if (!id) return json(res, 400, { error: "id required" });
    const u = ensureUser(id);
    const stats = ensureUserStats(id);
    const followerIds = getFollowerIds(id, follows);
    const followingSet = follows.get(id) || new Set();
    const postCount = posts.filter((p) => p.authorId === id).length;
    const requestCount = requests.filter((r) => r.ownerId === id).length;
    const tagCountMap = new Map();
    for (const i of introductions) {
      if (i.introducerId !== id) continue;
      if (i.outcome !== "success") continue;
      const r = requests.find((x) => x.id === i.requestId);
      if (!r || !Array.isArray(r.tags)) continue;
      for (const tag of r.tags) {
        const k = String(tag || "").trim();
        if (!k) continue;
        tagCountMap.set(k, (tagCountMap.get(k) || 0) + 1);
      }
    }
    const topTags = Array.from(tagCountMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => ({ tag, count }));
    return json(res, 200, {
      item: {
        id: u.id,
        displayName: u.displayName,
        followerCount: followerIds.length,
        followingCount: followingSet.size,
        postCount,
        requestCount,
        points: stats.points,
        introSuccessCount: stats.introSuccessCount,
        introFailCount: stats.introFailCount,
        topTags
      }
    });
  }

  if (req.method === "GET" && url.pathname === "/companies") {
    const viewerId = getAuthUserId(req, tokenToUser, tokenMeta, userTokens);
    const q = String(url.searchParams.get("q") || "").trim().toLowerCase();
    const cursor = String(url.searchParams.get("cursor") || "");
    const limitRaw = Number(url.searchParams.get("limit") || 20);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 50) : 20;

    const base = companies.slice().sort((a, b) => b.createdAt - a.createdAt);
    const filtered = q
      ? base.filter((c) => {
          if (String(c.name || "").toLowerCase().includes(q)) return true;
          if (String(c.region || "").toLowerCase().includes(q)) return true;
          if (Array.isArray(c.aliases) && c.aliases.some((a) => String(a || "").toLowerCase().includes(q))) return true;
          if (Array.isArray(c.tags) && c.tags.some((t) => String(t || "").toLowerCase().includes(q))) return true;
          if (Array.isArray(c.roles) && c.roles.some((r) => String(r.business || "").toLowerCase().includes(q))) return true;
          return false;
        })
      : base;

    const page = paginateByCursor(filtered, cursor, limit, (x) => x.id);
    const items = page.items.map((c) => ({
      id: c.id,
      name: c.name,
      region: c.region,
      tags: Array.isArray(c.tags) ? c.tags : [],
      roleCount: Array.isArray(c.roles) ? c.roles.length : 0,
      roles: Array.isArray(c.roles) ? c.roles.slice(0, 3) : [],
      followerCount: getCompanyFollowerCount(c.id, companyFollows),
      followedByMe: viewerId ? (companyFollows.get(viewerId) || new Set()).has(c.id) : false,
      createdAt: c.createdAt
    }));
    return json(res, 200, { items, nextCursor: page.nextCursor, hasMore: page.hasMore });
  }

  if (req.method === "GET" && url.pathname === "/companies/me/following") {
    const userId = getAuthUserId(req, tokenToUser, tokenMeta, userTokens);
    if (!userId) return json(res, 401, { error: "Unauthorized" });
    const set = companyFollows.get(userId) || new Set();
    const ids = Array.from(set.values());
    const cursor = String(url.searchParams.get("cursor") || "");
    const limitRaw = Number(url.searchParams.get("limit") || 20);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 50) : 20;
    const sorted = ids
      .map((id) => companies.find((c) => c.id === id))
      .filter(Boolean)
      .sort((a, b) => b.createdAt - a.createdAt);
    const page = paginateByCursor(sorted, cursor, limit, (x) => x.id);
    const items = page.items.map((c) => ({
      id: c.id,
      name: c.name,
      region: c.region,
      tags: Array.isArray(c.tags) ? c.tags : [],
      roleCount: Array.isArray(c.roles) ? c.roles.length : 0,
      roles: Array.isArray(c.roles) ? c.roles.slice(0, 3) : [],
      followerCount: getCompanyFollowerCount(c.id, companyFollows),
      followedByMe: true,
      createdAt: c.createdAt
    }));
    return json(res, 200, { items, nextCursor: page.nextCursor, hasMore: page.hasMore });
  }

  if (req.method === "POST" && url.pathname === "/companies") {
    const userId = getAuthUserId(req, tokenToUser, tokenMeta, userTokens);
    if (!userId) return json(res, 401, { error: "Unauthorized" });
    ensureUser(userId);

    const body = await readJson(req).catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const region = typeof body?.region === "string" ? body.region.trim() : "";
    const tags = Array.isArray(body?.tags)
      ? body.tags.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 10)
      : [];
    const rolesRaw = Array.isArray(body?.roles) ? body.roles : [];
    const roles = rolesRaw
      .map((r) => ({
        business: String(r?.business || "").trim(),
        title: String(r?.title || "").trim()
      }))
      .filter((r) => r.business && r.title)
      .slice(0, 20);

    if (!name) return json(res, 400, { error: "name required" });
    if (roles.length === 0) return json(res, 400, { error: "roles required" });

    const item = {
      id: `c_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      name: name.slice(0, 80),
      aliases: [],
      region: region.slice(0, 80),
      tags,
      roles,
      createdAt: Date.now()
    };
    markDirty();
    companies.push(item);
    return json(res, 201, { item });
  }

  const companyMatch = url.pathname.match(/^\/companies\/([^/]+)$/);
  if (req.method === "GET" && companyMatch && companyMatch[1] !== "resolve") {
    const viewerId = getAuthUserId(req, tokenToUser, tokenMeta, userTokens);
    const id = decodeURIComponent(companyMatch[1]);
    const c = companies.find((x) => x.id === id);
    if (!c) return json(res, 404, { error: "Not Found" });
    const followerCount = getCompanyFollowerCount(c.id, companyFollows);
    const followedByMe = viewerId ? (companyFollows.get(viewerId) || new Set()).has(c.id) : false;
    return json(res, 200, {
      item: {
        id: c.id,
        name: c.name,
        region: c.region,
        tags: Array.isArray(c.tags) ? c.tags : [],
        roles: Array.isArray(c.roles) ? c.roles : [],
        followerCount,
        followedByMe,
        createdAt: c.createdAt
      }
    });
  }

  if (req.method === "GET" && url.pathname === "/companies/resolve") {
    const name = String(url.searchParams.get("name") || "").trim();
    if (!name) return json(res, 400, { error: "name required" });
    const key = normalizeCompany(name);
    const c =
      companies.find((x) => normalizeCompany(x?.name || "") === key) ||
      companies.find((x) => Array.isArray(x?.aliases) && x.aliases.some((a) => normalizeCompany(a) === key));
    if (!c) return json(res, 404, { error: "Not Found" });
    return json(res, 200, { item: { id: c.id, name: c.name } });
  }

  const companyAliasAddMatch = url.pathname.match(/^\/companies\/([^/]+)\/aliases$/);
  if (req.method === "POST" && companyAliasAddMatch) {
    const userId = getAuthUserId(req, tokenToUser, tokenMeta, userTokens);
    if (!userId) return json(res, 401, { error: "Unauthorized" });
    const id = decodeURIComponent(companyAliasAddMatch[1]);
    const c = companies.find((x) => x.id === id);
    if (!c) return json(res, 404, { error: "Not Found" });
    const body = await readJson(req).catch(() => null);
    const alias = typeof body?.alias === "string" ? body.alias.trim() : "";
    if (!alias) return json(res, 400, { error: "alias required" });
    if (alias.length > 80) return json(res, 400, { error: "alias too long" });

    const aliasKey = normalizeCompany(alias);
    if (!aliasKey) return json(res, 400, { error: "alias invalid" });

    const conflict = companies.find((x) => {
      if (!x || x.id === c.id) return false;
      if (normalizeCompany(x.name || "") === aliasKey) return true;
      if (Array.isArray(x.aliases) && x.aliases.some((a) => normalizeCompany(a) === aliasKey)) return true;
      return false;
    });
    if (conflict) {
      return json(res, 409, { error: "alias conflicts", conflict: { id: conflict.id, name: conflict.name } });
    }

    const set = new Set(Array.isArray(c.aliases) ? c.aliases.map((x) => String(x || "").trim()).filter(Boolean) : []);
    set.add(alias);
    c.aliases = Array.from(set.values()).slice(0, 50);
    markDirty();
    return json(res, 200, { item: { id: c.id, aliases: c.aliases } });
  }

  const adminAliasesMatch = url.pathname.match(/^\/admin\/companies\/([^/]+)\/aliases$/);
  if (req.method === "PUT" && adminAliasesMatch) {
    if (!isAdmin(req)) return json(res, 403, { error: "Forbidden" });
    const id = decodeURIComponent(adminAliasesMatch[1]);
    const c = companies.find((x) => x.id === id);
    if (!c) return json(res, 404, { error: "Not Found" });
    const body = await readJson(req).catch(() => null);
    const add = Array.isArray(body?.add) ? body.add.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 50) : [];
    const remove = Array.isArray(body?.remove) ? body.remove.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 50) : [];
    const set = new Set(Array.isArray(c.aliases) ? c.aliases.map((x) => String(x || "").trim()).filter(Boolean) : []);
    for (const a of add) set.add(a);
    for (const r of remove) set.delete(r);
    c.aliases = Array.from(set.values()).slice(0, 50);
    markDirty();
    return json(res, 200, { item: { id: c.id, aliases: c.aliases } });
  }

  if (req.method === "POST" && url.pathname === "/admin/companies/merge") {
    if (!isAdmin(req)) return json(res, 403, { error: "Forbidden" });
    const body = await readJson(req).catch(() => null);
    const sourceId = typeof body?.sourceId === "string" ? body.sourceId.trim() : "";
    const targetId = typeof body?.targetId === "string" ? body.targetId.trim() : "";
    if (!sourceId || !targetId) return json(res, 400, { error: "sourceId and targetId required" });
    if (sourceId === targetId) return json(res, 400, { error: "cannot merge same id" });
    const source = companies.find((x) => x.id === sourceId);
    const target = companies.find((x) => x.id === targetId);
    if (!source || !target) return json(res, 404, { error: "Not Found" });

    const aliasSet = new Set(Array.isArray(target.aliases) ? target.aliases : []);
    aliasSet.add(source.name);
    if (Array.isArray(source.aliases)) for (const a of source.aliases) aliasSet.add(a);
    target.aliases = Array.from(aliasSet.values()).map((x) => String(x || "").trim()).filter(Boolean).slice(0, 50);

    for (const r of requests) {
      if (String(r.companyId || "") === sourceId) {
        r.companyId = targetId;
        r.companyName = String(target.name || "").slice(0, 120);
      }
    }
    for (const ct of contacts) {
      if (String(ct.companyId || "") === sourceId) {
        ct.companyId = targetId;
        ct.companyName = String(target.name || "");
        const businessKey = normalizeBusiness(ct.business || "");
        const channelKey = normalizeChannel(ct.contactChannel || "");
        ct.key = `${targetId}|${businessKey}|${channelKey}`;
        ct.updatedAt = Date.now();
      }
    }
    for (const set of companyFollows.values()) {
      if (!set || !set.has) continue;
      if (set.has(sourceId)) {
        set.delete(sourceId);
        set.add(targetId);
      }
    }

    const idx = companies.findIndex((x) => x.id === sourceId);
    if (idx >= 0) companies.splice(idx, 1);
    markDirty();
    return json(res, 200, { ok: true, sourceId, targetId });
  }

  if (req.method === "POST" && url.pathname === "/admin/normalizeChannels") {
    if (!isAdmin(req)) return json(res, 403, { error: "Forbidden" });
    const body = await readJson(req).catch(() => null);
    const dryRun = Boolean(body?.dryRun);
    return json(res, 200, normalizeStoredChannels({ dryRun }));
  }

  const companyFollowMatch = url.pathname.match(/^\/companies\/([^/]+)\/follow$/);
  if (req.method === "POST" && companyFollowMatch) {
    const userId = getAuthUserId(req, tokenToUser, tokenMeta, userTokens);
    if (!userId) return json(res, 401, { error: "Unauthorized" });
    const companyId = decodeURIComponent(companyFollowMatch[1]);
    const c = companies.find((x) => x.id === companyId);
    if (!c) return json(res, 404, { error: "Not Found" });
    const set = companyFollows.get(userId) || new Set();
    markDirty();
    if (set.has(companyId)) set.delete(companyId);
    else set.add(companyId);
    companyFollows.set(userId, set);
    const followerCount = getCompanyFollowerCount(companyId, companyFollows);
    return json(res, 200, { following: set.has(companyId), followerCount });
  }

  if (req.method === "GET" && url.pathname === "/contacts/match") {
    const userId = getAuthUserId(req, tokenToUser, tokenMeta, userTokens);
    if (!userId) return json(res, 401, { error: "Unauthorized" });
    let companyId = String(url.searchParams.get("companyId") || "").trim();
    const companyName = String(url.searchParams.get("company") || "").trim();
    const businessesParam = String(url.searchParams.get("businesses") || url.searchParams.get("business") || "");
    const limitRaw = Number(url.searchParams.get("limit") || 5);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 20) : 5;
    if (!companyId && !companyName) return json(res, 400, { error: "company required" });

    if (!companyId && companyName) {
      const key = normalizeCompany(companyName);
      const c =
        companies.find((x) => normalizeCompany(x?.name || "") === key) ||
        companies.find((x) => Array.isArray(x?.aliases) && x.aliases.some((a) => normalizeCompany(a) === key));
      if (c) companyId = c.id;
    }

    const companyKey = companyId ? "" : normalizeCompany(companyName);
    const wanted = businessesParam
      .split(",")
      .map((x) => normalizeBusiness(x))
      .filter(Boolean)
      .slice(0, 20);
    const wantedSet = wanted.length > 0 ? new Set(wanted) : null;

    const candidates = contacts.filter((c) => {
      if (!c) return false;
      if (String(c.status || "") === "invalid") return false;
      if (companyId) {
        if (String(c.companyId || "") !== companyId) return false;
      } else {
        const cCompanyKey = normalizeCompany(c.companyName || "");
        if (!cCompanyKey || cCompanyKey !== companyKey) return false;
      }
      if (wantedSet) {
        const b = normalizeBusiness(c.business || "");
        if (!wantedSet.has(b)) return false;
      }
      return true;
    });

    const verifiedOnly = candidates.filter((c) => String(c.status || "") === "verified" || Boolean(c.verifiedAt));
    const matches = verifiedOnly.length > 0 ? verifiedOnly : candidates;

    const byBusiness = new Map();
    for (const c of matches) {
      const bKey = normalizeBusiness(c.business || "");
      const list = byBusiness.get(bKey) || [];
      list.push(c);
      byBusiness.set(bKey, list);
    }

    const now = Date.now();
    const computeStatus = (x) => {
      const s = String(x?.status || "");
      if (s === "invalid") return "invalid";
      const endorseCount = Array.isArray(x?.endorsedBy) ? x.endorsedBy.length : 0;
      if (endorseCount >= CONTACT_ENDORSE_VERIFY_N) return "verified";
      const verifiedAt = Number(x?.verifiedAt || 0);
      if (verifiedAt && now - verifiedAt > CONTACT_STALE_MS) return "stale";
      if (s === "verified" || verifiedAt) return "verified";
      if (s) return s;
      return "candidate";
    };

    const items = Array.from(byBusiness.entries())
      .map(([b, list]) => {
        const statusRank = (x) => {
          const s = computeStatus(x);
          if (s === "verified") return 0;
          if (s === "stale") return 1;
          if (s === "candidate") return 2;
          if (s === "invalid") return 3;
          return 4;
        };
        const sorted = list
          .slice()
          .sort(
            (a, b) =>
              statusRank(a) - statusRank(b) ||
              (b.successCount || 0) - (a.successCount || 0) ||
              (b.verifiedAt || 0) - (a.verifiedAt || 0) ||
              (b.updatedAt || 0) - (a.updatedAt || 0)
          );
        return {
          business: b,
          contacts: sorted.slice(0, limit).map((x) => ({
            id: x.id,
            companyId: x.companyId || "",
            companyName: x.companyName,
            business: x.business,
            contactName: x.contactName || "",
            contactTitle: x.contactTitle || "",
            contactChannel: x.contactChannel || "",
            clue: x.clue || "",
            status: computeStatus(x),
            verifiedAt: x.verifiedAt || 0,
            successCount: x.successCount || 0,
            failCount: x.failCount || 0,
            lastFailureAt: x.lastFailureAt || 0,
            lastFailureReason: x.lastFailureReason || "",
            endorsedCount: Array.isArray(x.endorsedBy) ? x.endorsedBy.length : 0
          }))
        };
      })
      .sort((a, b) => a.business.localeCompare(b.business));

    return json(res, 200, { items });
  }

  if (req.method === "GET" && url.pathname === "/contacts/list") {
    const userId = getAuthUserId(req, tokenToUser, tokenMeta, userTokens);
    if (!userId) return json(res, 401, { error: "Unauthorized" });
    const companyId = String(url.searchParams.get("companyId") || "").trim();
    const statusesParam = String(url.searchParams.get("statuses") || "stale,candidate").trim();
    const limitRaw = Number(url.searchParams.get("limit") || 100);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 200) : 100;
    if (!companyId) return json(res, 400, { error: "companyId required" });

    const now = Date.now();
    const computeStatus = (x) => {
      const s = String(x?.status || "");
      if (s === "invalid") return "invalid";
      const endorseCount = Array.isArray(x?.endorsedBy) ? x.endorsedBy.length : 0;
      if (endorseCount >= CONTACT_ENDORSE_VERIFY_N) return "verified";
      const verifiedAt = Number(x?.verifiedAt || 0);
      if (verifiedAt && now - verifiedAt > CONTACT_STALE_MS) return "stale";
      if (s === "verified" || verifiedAt) return "verified";
      if (s) return s;
      return "candidate";
    };
    const wantedStatuses = new Set(
      statusesParam
        .split(",")
        .map((x) => String(x || "").trim())
        .filter(Boolean)
        .slice(0, 10)
    );

    const items = contacts
      .filter((c) => c && String(c.companyId || "") === companyId)
      .map((c) => ({ c, status: computeStatus(c) }))
      .filter((x) => wantedStatuses.has(x.status))
      .sort((a, b) => (b.c.updatedAt || 0) - (a.c.updatedAt || 0) || (b.c.verifiedAt || 0) - (a.c.verifiedAt || 0))
      .slice(0, limit)
      .map((x) => ({
        id: x.c.id,
        companyId: x.c.companyId || "",
        companyName: x.c.companyName || "",
        business: x.c.business || "",
        contactName: x.c.contactName || "",
        contactTitle: x.c.contactTitle || "",
        contactChannel: x.c.contactChannel || "",
        clue: x.c.clue || "",
        status: x.status,
        verifiedAt: x.c.verifiedAt || 0,
        successCount: x.c.successCount || 0,
        failCount: x.c.failCount || 0,
        lastFailureAt: x.c.lastFailureAt || 0,
        lastFailureReason: x.c.lastFailureReason || "",
        endorsedCount: Array.isArray(x.c.endorsedBy) ? x.c.endorsedBy.length : 0,
        updatedAt: x.c.updatedAt || 0
      }));

    return json(res, 200, { items });
  }

  if (req.method === "POST" && url.pathname === "/contacts/batchFeedback") {
    const userId = getAuthUserId(req, tokenToUser, tokenMeta, userTokens);
    if (!userId) return json(res, 401, { error: "Unauthorized" });
    const body = await readJson(req).catch(() => null);
    const action = typeof body?.action === "string" ? body.action.trim() : "";
    const ids = Array.isArray(body?.ids) ? body.ids.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 50) : [];
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (ids.length === 0) return json(res, 400, { error: "ids required" });
    if (action !== "confirm" && action !== "invalid") return json(res, 400, { error: "action must be confirm|invalid" });
    const now = Date.now();
    let okCount = 0;
    const notFound = [];
    markDirty();
    for (const id of ids) {
      const c = contacts.find((x) => x && x.id === id);
      if (!c) {
        notFound.push(id);
        continue;
      }
      if (action === "confirm") {
        c.status = "verified";
        c.verifiedAt = now;
        c.updatedAt = now;
        okCount += 1;
      } else {
        c.status = "invalid";
        c.failCount = Number(c.failCount || 0) + 1;
        c.lastFailureAt = now;
        c.lastFailureReason = reason.slice(0, 80);
        c.updatedAt = now;
        okCount += 1;
      }
    }
    return json(res, 200, { ok: true, okCount, notFound });
  }

  if (req.method === "POST" && url.pathname === "/contacts/batchUpdate") {
    const userId = getAuthUserId(req, tokenToUser, tokenMeta, userTokens);
    if (!userId) return json(res, 401, { error: "Unauthorized" });
    const body = await readJson(req).catch(() => null);
    const op = typeof body?.op === "string" ? body.op.trim() : "";
    const ids = Array.isArray(body?.ids) ? body.ids.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 50) : [];
    if (ids.length === 0) return json(res, 400, { error: "ids required" });
    if (op !== "replaceChannel") return json(res, 400, { error: "op must be replaceChannel" });
    const from = typeof body?.from === "string" ? body.from : "";
    const to = typeof body?.to === "string" ? body.to : "";
    if (!from) return json(res, 400, { error: "from required" });
    const now = Date.now();
    const notFound = [];
    const conflictIds = [];
    const unchangedIds = [];
    let okCount = 0;

    const computeKey = (ct, contactChannel) => {
      const channelKey = normalizeChannel(contactChannel);
      const businessKey = normalizeBusiness(ct.business || "");
      if (ct.companyId) return `${ct.companyId}|${businessKey}|${channelKey}`;
      return `${normalizeCompany(ct.companyName || "")}|${businessKey}|${channelKey}`;
    };

    markDirty();
    for (const id of ids) {
      const c = contacts.find((x) => x && x.id === id);
      if (!c) {
        notFound.push(id);
        continue;
      }
      const current = String(c.contactChannel || "");
      const next = current.includes(from) ? current.split(from).join(to) : current;
      if (next === current) {
        unchangedIds.push(id);
        continue;
      }
      const nextKey = computeKey(c, next);
      const conflict = contacts.find((x) => x && x.id !== c.id && String(x.key || "") === nextKey);
      if (conflict) {
        conflictIds.push(id);
        continue;
      }
      c.contactChannel = next.slice(0, 200);
      c.key = nextKey;
      c.updatedAt = now;
      okCount += 1;
    }
    return json(res, 200, { ok: true, okCount, notFound, conflictIds, unchangedIds });
  }

  const contactEndorseMatch = url.pathname.match(/^\/contacts\/([^/]+)\/endorse$/);
  if (req.method === "POST" && contactEndorseMatch) {
    const userId = getAuthUserId(req, tokenToUser, tokenMeta, userTokens);
    if (!userId) return json(res, 401, { error: "Unauthorized" });
    const id = decodeURIComponent(contactEndorseMatch[1]);
    const c = contacts.find((x) => x && x.id === id);
    if (!c) return json(res, 404, { error: "Not Found" });
    if (String(c.status || "") === "invalid") return json(res, 400, { error: "contact invalid" });

    const u = ensureUser(userId);
    const companyId = String(c.companyId || "").trim();
    if (!companyId) return json(res, 400, { error: "companyId required" });
    if (String(u.companyId || "").trim() !== companyId) return json(res, 403, { error: "Forbidden" });

    const endorsedBy = Array.isArray(c.endorsedBy) ? c.endorsedBy.map((x) => String(x || "").trim()).filter(Boolean) : [];
    if (!endorsedBy.includes(userId)) endorsedBy.push(userId);
    c.endorsedBy = endorsedBy.slice(0, 50);

    const now = Date.now();
    if (c.endorsedBy.length >= CONTACT_ENDORSE_VERIFY_N) {
      c.status = "verified";
      c.verifiedAt = now;
    } else if (!String(c.status || "").trim()) {
      c.status = "candidate";
    }
    c.updatedAt = now;
    markDirty();
    return json(res, 200, { ok: true, endorsedCount: c.endorsedBy.length, status: String(c.status || "") });
  }

  const contactFeedbackMatch = url.pathname.match(/^\/contacts\/([^/]+)\/feedback$/);
  if (req.method === "POST" && contactFeedbackMatch) {
    const userId = getAuthUserId(req, tokenToUser, tokenMeta, userTokens);
    if (!userId) return json(res, 401, { error: "Unauthorized" });
    const id = decodeURIComponent(contactFeedbackMatch[1]);
    const c = contacts.find((x) => x && x.id === id);
    if (!c) return json(res, 404, { error: "Not Found" });
    const body = await readJson(req).catch(() => null);
    const action = typeof body?.action === "string" ? body.action.trim() : "";
    const now = Date.now();

    const computeKey = (ct, contactChannel) => {
      const channelKey = normalizeChannel(contactChannel);
      const businessKey = normalizeBusiness(ct.business || "");
      if (ct.companyId) return `${ct.companyId}|${businessKey}|${channelKey}`;
      return `${normalizeCompany(ct.companyName || "")}|${businessKey}|${channelKey}`;
    };

    if (action === "confirm") {
      markDirty();
      c.status = "verified";
      c.verifiedAt = now;
      c.updatedAt = now;
      return json(res, 200, { ok: true });
    }

    if (action === "invalid") {
      const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
      markDirty();
      c.status = "invalid";
      c.failCount = Number(c.failCount || 0) + 1;
      c.lastFailureAt = now;
      c.lastFailureReason = reason.slice(0, 80);
      c.updatedAt = now;
      return json(res, 200, { ok: true });
    }

    if (action === "update") {
      const contactChannelRaw = typeof body?.contactChannel === "string" ? body.contactChannel.trim() : "";
      const contactChannel = contactChannelRaw ? (canonicalizeContactChannel(contactChannelRaw)?.display || contactChannelRaw) : "";
      const contactName = typeof body?.contactName === "string" ? body.contactName.trim() : "";
      const contactTitle = typeof body?.contactTitle === "string" ? body.contactTitle.trim() : "";
      const clue = typeof body?.clue === "string" ? body.clue.trim() : "";
      if (contactChannel) {
        const nextKey = computeKey(c, contactChannel);
        const conflict = contacts.find((x) => x && x.id !== c.id && String(x.key || "") === nextKey);
        if (conflict) return json(res, 409, { error: "conflict" });
        markDirty();
        c.contactChannel = contactChannel.slice(0, 200);
        c.key = nextKey;
      } else {
        markDirty();
      }
      if (contactName) c.contactName = contactName.slice(0, 80);
      if (contactTitle) c.contactTitle = contactTitle.slice(0, 120);
      if (clue) c.clue = clue.slice(0, 1000);
      c.updatedAt = now;
      return json(res, 200, { ok: true });
    }

    return json(res, 400, { error: "action must be confirm|invalid|update" });
  }

  if (req.method === "GET" && url.pathname === "/requests") {
    const viewerId = getAuthUserId(req, tokenToUser, tokenMeta, userTokens);
    const mineOnly = String(url.searchParams.get("mine") || "") === "1";
    const includeClosed = String(url.searchParams.get("includeClosed") || "") === "1";
    const tag = String(url.searchParams.get("tag") || "").trim();
    const company = String(url.searchParams.get("company") || "").trim().toLowerCase();
    const cursor = String(url.searchParams.get("cursor") || "");
    const limitRaw = Number(url.searchParams.get("limit") || 20);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 50) : 20;

    if (mineOnly && !viewerId) return json(res, 401, { error: "Unauthorized" });
    const base = mineOnly ? requests.filter((r) => r.ownerId === viewerId) : requests;
    const visible = includeClosed ? base : base.filter((r) => r.status !== "closed");
    const filteredByTag = tag ? visible.filter((r) => Array.isArray(r.tags) && r.tags.includes(tag)) : visible;
    const filtered = company
      ? filteredByTag.filter((r) => String(r.companyName || "").toLowerCase().includes(company))
      : filteredByTag;
    const list = filtered.slice().sort((a, b) => b.createdAt - a.createdAt);
    const page = paginateByCursor(list, cursor, limit, (x) => x.id);
    const items = page.items.map((r) => ({
      id: r.id,
      ownerId: r.ownerId,
      ownerDisplayName: ensureUser(r.ownerId).displayName,
      title: r.title,
      content: r.content,
      companyId: r.companyId || "",
      companyName: r.companyName || "",
      tags: Array.isArray(r.tags) ? r.tags : [],
      status: r.status || "open",
      createdAt: r.createdAt,
      introCount: introductions.filter((i) => i.requestId === r.id).length,
      isMine: viewerId ? r.ownerId === viewerId : false
    }));
    return json(res, 200, { items, nextCursor: page.nextCursor, hasMore: page.hasMore });
  }

  if (req.method === "GET" && url.pathname === "/tags") {
    const scope = String(url.searchParams.get("scope") || "requests");
    const limitRaw = Number(url.searchParams.get("limit") || 20);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 50) : 20;

    if (scope !== "requests") return json(res, 400, { error: "scope must be requests" });
    const map = new Map();
    for (const r of requests) {
      if (r.status === "closed") continue;
      if (!Array.isArray(r.tags)) continue;
      for (const tag of r.tags) {
        const k = String(tag || "").trim();
        if (!k) continue;
        map.set(k, (map.get(k) || 0) + 1);
      }
    }
    const items = Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([tag, count]) => ({ tag, count }));
    return json(res, 200, { items });
  }

  if (req.method === "POST" && url.pathname === "/requests") {
    const userId = getAuthUserId(req, tokenToUser, tokenMeta, userTokens);
    if (!userId) return json(res, 401, { error: "Unauthorized" });
    const u = ensureUser(userId);
    ensureUserStats(userId);

    const body = await readJson(req).catch(() => null);
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    const companyId = typeof body?.companyId === "string" ? body.companyId.trim() : "";
    const companyName = typeof body?.companyName === "string" ? body.companyName.trim() : "";
    const ownerContactChannelRaw = typeof body?.ownerContactChannel === "string" ? body.ownerContactChannel.trim() : "";
    const tags = Array.isArray(body?.tags)
      ? body.tags.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 10)
      : [];
    if (!content) return json(res, 400, { error: "content required" });

    const companyFromId = companyId ? companies.find((x) => x.id === companyId) : null;
    const companyFromName =
      !companyFromId && companyName
        ? companies.find((x) => normalizeCompany(x?.name || "") === normalizeCompany(companyName)) ||
          companies.find((x) => Array.isArray(x?.aliases) && x.aliases.some((a) => normalizeCompany(a) === normalizeCompany(companyName)))
        : null;
    const finalCompany = companyFromId || companyFromName;
    const finalCompanyId = finalCompany ? finalCompany.id : "";
    const finalCompanyName = finalCompany ? finalCompany.name : companyName;
    const ownerChannelCandidate = (ownerContactChannelRaw || String(u.contactChannel || "")).trim();
    const finalOwnerContactChannel = (canonicalizeContactChannel(ownerChannelCandidate)?.display || ownerChannelCandidate).slice(0, 200);
    if (ownerContactChannelRaw && !String(u.contactChannel || "").trim()) {
      u.contactChannel = finalOwnerContactChannel.slice(0, 200);
      users.set(userId, u);
      upsertSelfClaimedContactsFromUser(u);
    }

    const reqItem = {
      id: `r_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      ownerId: userId,
      title: title || "Untitled",
      content: content.slice(0, 2000),
      companyId: finalCompanyId,
      companyName: String(finalCompanyName || "").slice(0, 120),
      ownerContactChannel: finalOwnerContactChannel,
      tags,
      status: "open",
      createdAt: Date.now()
    };
    markDirty();
    requests.push(reqItem);
    return json(res, 201, {
      item: {
        ...reqItem,
        ownerDisplayName: u.displayName,
        introCount: 0,
        isMine: true
      }
    });
  }

  const requestMatch = url.pathname.match(/^\/requests\/([^/]+)$/);
  if (req.method === "GET" && requestMatch) {
    const viewerId = getAuthUserId(req, tokenToUser, tokenMeta, userTokens);
    const id = decodeURIComponent(requestMatch[1]);
    const r = requests.find((x) => x.id === id);
    if (!r) return json(res, 404, { error: "Not Found" });
    const isMine = viewerId ? r.ownerId === viewerId : false;
    const owner = ensureUser(r.ownerId);
    const visibility = String(owner.contactVisibility || "loggedIn");
    const canViewOwnerContact =
      Boolean(viewerId) &&
      (visibility === "loggedIn" ||
        (visibility === "private" && viewerId === r.ownerId) ||
        (visibility === "mutual" &&
          Boolean((follows.get(viewerId) || new Set()).has(r.ownerId)) &&
          Boolean((follows.get(r.ownerId) || new Set()).has(viewerId))));
    const introItems = introductions
      .filter((i) => i.requestId === r.id)
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((i) => ({
        id: i.id,
        requestId: i.requestId,
        introducerId: i.introducerId,
        introducerDisplayName: ensureUser(i.introducerId).displayName,
        note: i.note,
        contactName: i.contactName || "",
        contactTitle: i.contactTitle || "",
        contactChannel: i.contactChannel || "",
        clue: i.clue || "",
        createdAt: i.createdAt,
        resolvedAt: i.resolvedAt,
        outcome: i.outcome
      }));
    return json(res, 200, {
      item: {
        id: r.id,
        ownerId: r.ownerId,
        ownerDisplayName: owner.displayName,
        title: r.title,
        content: r.content,
        companyId: r.companyId || "",
        companyName: r.companyName || "",
        ownerContactChannel: canViewOwnerContact ? String(r.ownerContactChannel || "") : "",
        tags: Array.isArray(r.tags) ? r.tags : [],
        status: r.status || "open",
        createdAt: r.createdAt,
        introCount: introItems.length,
        isMine
      },
      introductions: introItems
    });
  }

  const recommendIntroMatch = url.pathname.match(/^\/requests\/([^/]+)\/recommend-introducers$/);
  if (req.method === "GET" && recommendIntroMatch) {
    const viewerId = getAuthUserId(req, tokenToUser, tokenMeta, userTokens);
    if (!viewerId) return json(res, 401, { error: "Unauthorized" });
    const id = decodeURIComponent(recommendIntroMatch[1]);
    const r = requests.find((x) => x.id === id);
    if (!r) return json(res, 404, { error: "Not Found" });
    const limitRaw = Number(url.searchParams.get("limit") || 5);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 20) : 5;
    const tagSet = new Set((Array.isArray(r.tags) ? r.tags : []).map((x) => String(x || "").trim()).filter(Boolean).slice(0, 10));
    const companyId = String(r.companyId || "").trim();
    const companyKey = companyId ? "" : normalizeCompany(r.companyName || "");

    const byUser = new Map();
    const now = Date.now();
    const RECENT_MS = 180 * 24 * 60 * 60 * 1000;
    for (const i of introductions) {
      if (i.outcome !== "success") continue;
      const rr = requests.find((x) => x.id === i.requestId);
      if (!rr) continue;
      if (companyId) {
        if (String(rr.companyId || "") !== companyId) continue;
      } else {
        if (normalizeCompany(rr.companyName || "") !== companyKey) continue;
      }
      const hasTag = Array.isArray(rr.tags) && rr.tags.some((t) => tagSet.has(String(t || "").trim()));
      if (!hasTag) continue;
      const userId = String(i.introducerId || "").trim();
      if (!userId || userId === r.ownerId) continue;
      const recencyBoost = i.resolvedAt && now - i.resolvedAt < RECENT_MS ? 1 : 0;
      const item = byUser.get(userId) || { userId, successCount: 0, score: 0 };
      item.successCount += 1;
      item.score += 2 + recencyBoost;
      byUser.set(userId, item);
    }

    if (companyId) {
      for (const [uid, set] of companyFollows.entries()) {
        if (!set || !set.has) continue;
        if (uid === r.ownerId) continue;
        if (set.has(companyId)) {
          const item = byUser.get(uid) || { userId: uid, successCount: 0, score: 0 };
          item.score += 1;
          byUser.set(uid, item);
        }
      }
    }

    const rows = Array.from(byUser.values())
      .filter((x) => x.userId !== viewerId)
      .sort((a, b) => b.score - a.score || b.successCount - a.successCount)
      .slice(0, limit);
    const items = rows.map((r) => {
      const u = ensureUser(r.userId);
      return { id: u.id, displayName: u.displayName, score: r.score, successCount: r.successCount };
    });
    return json(res, 200, { items });
  }

  const requestPingMatch = url.pathname.match(/^\/requests\/([^/]+)\/ping$/);
  if (req.method === "POST" && requestPingMatch) {
    const userId = getAuthUserId(req, tokenToUser, tokenMeta, userTokens);
    if (!userId) return json(res, 401, { error: "Unauthorized" });
    const id = decodeURIComponent(requestPingMatch[1]);
    const r = requests.find((x) => x.id === id);
    if (!r) return json(res, 404, { error: "Not Found" });
    if (r.ownerId !== userId) return json(res, 403, { error: "Forbidden" });

    const body = await readJson(req).catch(() => null);
    const toUserId = typeof body?.toUserId === "string" ? body.toUserId.trim() : "";
    if (!toUserId) return json(res, 400, { error: "toUserId required" });
    if (toUserId === userId) return json(res, 400, { error: "cannot ping self" });

    ensureUser(toUserId);
    ensureUser(userId);

    const exists = notifications.some(
      (n) => n && n.type === "requestPing" && n.toUserId === toUserId && String(n.data?.requestId || "") === r.id && String(n.data?.fromUserId || "") === userId
    );
    if (exists) return json(res, 200, { ok: true, duplicated: true });

    const owner = ensureUser(userId);
    notifications.push({
      id: `n_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      toUserId,
      type: "requestPing",
      title: "Request needs help / 求助提醒",
      content: `${owner.displayName}: ${r.title}`.slice(0, 500),
      createdAt: Date.now(),
      readAt: null,
      data: { requestId: r.id, fromUserId: userId, companyId: r.companyId || "", companyName: r.companyName || "", tags: Array.isArray(r.tags) ? r.tags : [] }
    });
    markDirty();
    return json(res, 200, { ok: true, duplicated: false });
  }

  if (req.method === "PUT" && requestMatch) {
    const userId = getAuthUserId(req, tokenToUser, tokenMeta, userTokens);
    if (!userId) return json(res, 401, { error: "Unauthorized" });
    const id = decodeURIComponent(requestMatch[1]);
    const r = requests.find((x) => x.id === id);
    if (!r) return json(res, 404, { error: "Not Found" });
    if (r.ownerId !== userId) return json(res, 403, { error: "Forbidden" });

    const body = await readJson(req).catch(() => null);
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    const companyId = typeof body?.companyId === "string" ? body.companyId.trim() : "";
    const companyName = typeof body?.companyName === "string" ? body.companyName.trim() : "";
    const ownerContactChannelRaw = typeof body?.ownerContactChannel === "string" ? body.ownerContactChannel.trim() : "";
    const status = typeof body?.status === "string" ? body.status.trim() : "";
    const tags = Array.isArray(body?.tags)
      ? body.tags.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 10)
      : null;

    const willChange = Boolean(title || content || companyId || companyName || ownerContactChannelRaw || tags || status);
    if (willChange) markDirty();
    if (title) r.title = title.slice(0, 80);
    if (content) r.content = content.slice(0, 2000);
    if (companyId) {
      const c = companies.find((x) => x.id === companyId);
      r.companyId = c ? c.id : "";
      if (c) r.companyName = String(c.name || "").slice(0, 120);
    } else if (companyName) {
      r.companyId = "";
      r.companyName = companyName.slice(0, 120);
    }
    if (tags) r.tags = tags;
    if (ownerContactChannelRaw) {
      const normalized = canonicalizeContactChannel(ownerContactChannelRaw)?.display || ownerContactChannelRaw;
      r.ownerContactChannel = normalized.slice(0, 200);
    }
    if (status === "open" || status === "closed") r.status = status;

    return json(res, 200, {
      item: {
        id: r.id,
        ownerId: r.ownerId,
        ownerDisplayName: ensureUser(r.ownerId).displayName,
        title: r.title,
        content: r.content,
        companyId: r.companyId || "",
        companyName: r.companyName || "",
        ownerContactChannel: String(r.ownerContactChannel || ""),
        tags: Array.isArray(r.tags) ? r.tags : [],
        status: r.status || "open",
        createdAt: r.createdAt,
        introCount: introductions.filter((i) => i.requestId === r.id).length,
        isMine: true
      }
    });
  }

  const requestIntroMatch = url.pathname.match(/^\/requests\/([^/]+)\/introductions$/);
  if (req.method === "POST" && requestIntroMatch) {
    const userId = getAuthUserId(req, tokenToUser, tokenMeta, userTokens);
    if (!userId) return json(res, 401, { error: "Unauthorized" });
    const requestId = decodeURIComponent(requestIntroMatch[1]);
    const r = requests.find((x) => x.id === requestId);
    if (!r) return json(res, 404, { error: "Not Found" });
    if (r.status === "closed") return json(res, 400, { error: "request closed" });
    if (r.ownerId === userId) return json(res, 400, { error: "cannot introduce for own request" });
    if (introductions.some((i) => i.requestId === r.id && i.introducerId === userId)) {
      return json(res, 400, { error: "already introduced" });
    }
    ensureUser(userId);
    ensureUserStats(userId);
    ensureUser(r.ownerId);
    ensureUserStats(r.ownerId);

    const body = await readJson(req).catch(() => null);
    const contactName = typeof body?.contactName === "string" ? body.contactName.trim() : "";
    const contactTitle = typeof body?.contactTitle === "string" ? body.contactTitle.trim() : "";
    const contactChannelRaw = typeof body?.contactChannel === "string" ? body.contactChannel.trim() : "";
    const contactChannel = contactChannelRaw ? (canonicalizeContactChannel(contactChannelRaw)?.display || contactChannelRaw) : "";
    const clue = typeof body?.clue === "string" ? body.clue.trim() : "";
    let note = typeof body?.note === "string" ? body.note.trim() : "";
    if (!note) {
      const parts = [];
      if (contactName) parts.push(`联系人：${contactName}`);
      if (contactTitle) parts.push(`岗位/部门：${contactTitle}`);
      if (contactChannel) parts.push(`联系方式：${contactChannel}`);
      if (clue) parts.push(`线索：${clue}`);
      note = parts.join("\n");
    }
    if (!note) return json(res, 400, { error: "note required" });

    const intro = {
      id: `i_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      requestId: r.id,
      introducerId: userId,
      note: note.slice(0, 2000),
      contactName: contactName.slice(0, 80),
      contactTitle: contactTitle.slice(0, 120),
      contactChannel: contactChannel.slice(0, 200),
      clue: clue.slice(0, 1000),
      createdAt: Date.now(),
      resolvedAt: null,
      outcome: null
    };
    markDirty();
    introductions.push(intro);

    notifications.push({
      id: `n_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      toUserId: r.ownerId,
      type: "intro",
      title: "New introduction / 新引荐",
      content: `${ensureUser(userId).displayName}: ${note}`.slice(0, 500),
      createdAt: Date.now(),
      readAt: null,
      data: { requestId: r.id, introId: intro.id, fromUserId: userId }
    });

    return json(res, 201, {
      item: {
        id: intro.id,
        requestId: intro.requestId,
        introducerId: intro.introducerId,
        introducerDisplayName: ensureUser(intro.introducerId).displayName,
        note: intro.note,
        contactName: intro.contactName || "",
        contactTitle: intro.contactTitle || "",
        contactChannel: intro.contactChannel || "",
        clue: intro.clue || "",
        createdAt: intro.createdAt,
        resolvedAt: null,
        outcome: null
      }
    });
  }

  if (req.method === "GET" && url.pathname === "/introductions") {
    const userId = getAuthUserId(req, tokenToUser, tokenMeta, userTokens);
    if (!userId) return json(res, 401, { error: "Unauthorized" });
    const mineOnly = String(url.searchParams.get("mine") || "") === "1";
    if (!mineOnly) return json(res, 400, { error: "mine=1 required" });
    const cursor = String(url.searchParams.get("cursor") || "");
    const limitRaw = Number(url.searchParams.get("limit") || 20);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 50) : 20;

    const list = introductions
      .filter((i) => i.introducerId === userId)
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt);
    const page = paginateByCursor(list, cursor, limit, (x) => x.id);
    const items = page.items.map((i) => {
      const r = requests.find((x) => x.id === i.requestId);
      return {
        id: i.id,
        requestId: i.requestId,
        requestTitle: r ? r.title : "",
        requestOwnerId: r ? r.ownerId : "",
        requestOwnerDisplayName: r ? ensureUser(r.ownerId).displayName : "",
        note: i.note,
        contactName: i.contactName || "",
        contactTitle: i.contactTitle || "",
        contactChannel: i.contactChannel || "",
        clue: i.clue || "",
        createdAt: i.createdAt,
        resolvedAt: i.resolvedAt,
        outcome: i.outcome,
        pointsAwarded: i.outcome === "success" ? 5 : i.outcome === "fail" ? 1 : 0
      };
    });
    return json(res, 200, { items, nextCursor: page.nextCursor, hasMore: page.hasMore });
  }

  const introResolveMatch = url.pathname.match(/^\/introductions\/([^/]+)\/resolve$/);
  if (req.method === "POST" && introResolveMatch) {
    const userId = getAuthUserId(req, tokenToUser, tokenMeta, userTokens);
    if (!userId) return json(res, 401, { error: "Unauthorized" });
    const id = decodeURIComponent(introResolveMatch[1]);
    const intro = introductions.find((x) => x.id === id);
    if (!intro) return json(res, 404, { error: "Not Found" });
    const r = requests.find((x) => x.id === intro.requestId);
    if (!r) return json(res, 404, { error: "Not Found" });
    if (r.ownerId !== userId) return json(res, 403, { error: "Forbidden" });

    const body = await readJson(req).catch(() => null);
    const outcome = typeof body?.outcome === "string" ? body.outcome.trim() : "";
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (outcome !== "success" && outcome !== "fail") return json(res, 400, { error: "outcome must be success|fail" });
    if (intro.resolvedAt) return json(res, 400, { error: "already resolved" });

    markDirty();
    intro.outcome = outcome;
    intro.resolvedAt = Date.now();

    const stats = ensureUserStats(intro.introducerId);
    if (outcome === "success") {
      stats.points += 5;
      stats.introSuccessCount += 1;
      const companyId = String(r.companyId || "").trim();
      const companyName = String(r.companyName || "").trim();
      const channelRaw = String(intro.contactChannel || "").trim();
      const channel = channelRaw ? (canonicalizeContactChannel(channelRaw)?.display || channelRaw) : "";
      if (channel && channel !== channelRaw) intro.contactChannel = channel;
      if ((companyId || companyName) && channel && Array.isArray(r.tags)) {
        const businesses = r.tags.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 10);
        for (const business of businesses) {
          upsertVerifiedContactFromIntroduction({
            companyId,
            companyName,
            business,
            intro,
            requestId: r.id
          });
        }
      }
    } else {
      stats.points += 1;
      stats.introFailCount += 1;
      const companyId = String(r.companyId || "").trim();
      const companyName = String(r.companyName || "").trim();
      const channelRaw = String(intro.contactChannel || "").trim();
      const channel = channelRaw ? (canonicalizeContactChannel(channelRaw)?.display || channelRaw) : "";
      if (channel && channel !== channelRaw) intro.contactChannel = channel;
      if ((companyId || companyName) && channel && Array.isArray(r.tags)) {
        const businesses = r.tags.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 10);
        for (const business of businesses) {
          upsertFailedContactFromIntroduction({
            companyId,
            companyName,
            business,
            intro,
            requestId: r.id,
            reason
          });
        }
      }
    }
    userStats.set(intro.introducerId, stats);

    notifications.push({
      id: `n_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      toUserId: intro.introducerId,
      type: "introResult",
      title: outcome === "success" ? "Introduction success / 引荐成功" : "Introduction not successful / 引荐未成功",
      content: `${ensureUser(r.ownerId).displayName}: ${r.title}`.slice(0, 500),
      createdAt: Date.now(),
      readAt: null,
      data: { requestId: r.id, introId: intro.id, fromUserId: r.ownerId }
    });

    return json(res, 200, {
      item: {
        id: intro.id,
        requestId: intro.requestId,
        introducerId: intro.introducerId,
        introducerDisplayName: ensureUser(intro.introducerId).displayName,
        note: intro.note,
        contactName: intro.contactName || "",
        contactTitle: intro.contactTitle || "",
        contactChannel: intro.contactChannel || "",
        clue: intro.clue || "",
        createdAt: intro.createdAt,
        resolvedAt: intro.resolvedAt,
        outcome: intro.outcome,
        pointsAwarded: outcome === "success" ? 5 : 1
      }
    });
  }

  const followersMatch = url.pathname.match(/^\/users\/([^/]+)\/followers$/);
  if (req.method === "GET" && followersMatch) {
    const id = decodeURIComponent(followersMatch[1]);
    if (!id) return json(res, 400, { error: "id required" });
    ensureUser(id);
    const cursor = String(url.searchParams.get("cursor") || "");
    const limitRaw = Number(url.searchParams.get("limit") || 20);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 50) : 20;
    const all = getFollowerIds(id, follows).sort();
    const page = paginateIds(all, cursor, limit);
    const items = page.items.map((userId) => {
      const u = ensureUser(userId);
      return { id: u.id, displayName: u.displayName };
    });
    return json(res, 200, { items, nextCursor: page.nextCursor, hasMore: page.hasMore });
  }

  const followingMatch = url.pathname.match(/^\/users\/([^/]+)\/following$/);
  if (req.method === "GET" && followingMatch) {
    const id = decodeURIComponent(followingMatch[1]);
    if (!id) return json(res, 400, { error: "id required" });
    ensureUser(id);
    const cursor = String(url.searchParams.get("cursor") || "");
    const limitRaw = Number(url.searchParams.get("limit") || 20);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 50) : 20;
    const set = follows.get(id) || new Set();
    const all = Array.from(set).sort();
    const page = paginateIds(all, cursor, limit);
    const items = page.items.map((userId) => {
      const u = ensureUser(userId);
      return { id: u.id, displayName: u.displayName };
    });
    return json(res, 200, { items, nextCursor: page.nextCursor, hasMore: page.hasMore });
  }

  if (req.method === "GET" && url.pathname === "/posts") {
    const viewerId = getAuthUserId(req, tokenToUser, tokenMeta, userTokens);

    const feed = String(url.searchParams.get("feed") || "all");
    const authorIdFilter = String(url.searchParams.get("authorId") || "");
    const cursor = String(url.searchParams.get("cursor") || "");
    const limitRaw = Number(url.searchParams.get("limit") || 20);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 50) : 20;

    let list = posts.slice().sort((a, b) => b.createdAt - a.createdAt);
    if (feed === "following") {
      if (!viewerId) return json(res, 401, { error: "Unauthorized" });
      const set = follows.get(viewerId);
      if (!set || set.size === 0) return json(res, 200, { items: [], nextCursor: null, hasMore: false });
      list = list.filter((p) => set.has(p.authorId));
    }
    if (authorIdFilter) {
      ensureUser(authorIdFilter);
      list = list.filter((p) => p.authorId === authorIdFilter);
    }

    let startIndex = 0;
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
      authorDisplayName: ensureUser(p.authorId).displayName,
      title: p.title,
      content: p.content,
      createdAt: p.createdAt,
      commentCount: p.comments.length,
      likeCount: p.likeUserIds.length,
      likedByMe: viewerId ? p.likeUserIds.includes(viewerId) : false
    }));
    return json(res, 200, { items, nextCursor, hasMore });
  }

  if (req.method === "GET" && url.pathname === "/search") {
    const viewerId = getAuthUserId(req, tokenToUser, tokenMeta, userTokens);
    const type = String(url.searchParams.get("type") || "posts");
    const q = String(url.searchParams.get("q") || "").trim().toLowerCase();
    const cursor = String(url.searchParams.get("cursor") || "");
    const limitRaw = Number(url.searchParams.get("limit") || 20);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 50) : 20;

    if (type === "users") {
      const base = Array.from(users.values());
      const all = q
        ? base.filter((u) => `${u.displayName} ${u.id}`.toLowerCase().includes(q))
        : base;
      all.sort((a, b) => a.displayName.localeCompare(b.displayName));
      const page = paginateIds(all.map((u) => u.id), cursor, limit);
      const items = page.items.map((id) => {
        const u = ensureUser(id);
        return { id: u.id, displayName: u.displayName };
      });
      return json(res, 200, { items, nextCursor: page.nextCursor, hasMore: page.hasMore });
    }

    const list = posts
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .filter((p) => {
        if (!q) return true;
        const u = ensureUser(p.authorId);
        return `${p.title}\n${p.content}\n${u.displayName}\n${p.authorId}`.toLowerCase().includes(q);
      });
    const page = paginateIds(list.map((p) => p.id), cursor, limit);
    const items = page.items.map((id) => {
      const p = list.find((x) => x.id === id);
      if (!p) return null;
      const u = ensureUser(p.authorId);
      return {
        id: p.id,
        authorId: p.authorId,
        authorDisplayName: u.displayName,
        title: p.title,
        content: p.content,
        createdAt: p.createdAt,
        commentCount: p.comments.length,
        likeCount: p.likeUserIds.length,
        likedByMe: viewerId ? p.likeUserIds.includes(viewerId) : false
      };
    }).filter(Boolean);
    return json(res, 200, { items, nextCursor: page.nextCursor, hasMore: page.hasMore });
  }

  if (req.method === "POST" && url.pathname === "/posts") {
    const userId = getAuthUserId(req, tokenToUser, tokenMeta, userTokens);
    if (!userId) return json(res, 401, { error: "Unauthorized" });

    const body = await readJson(req).catch(() => null);
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    if (!content) return json(res, 400, { error: "content required" });

    const post = {
      id: `p_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      authorId: userId,
      title: title || "Untitled",
      content,
      createdAt: Date.now(),
      comments: [],
      likeUserIds: []
    };
    markDirty();
    posts.push(post);
    return json(res, 201, { item: viewPostDetail(post, userId) });
  }

  const postMatch = url.pathname.match(/^\/posts\/([^/]+)$/);
  if (req.method === "GET" && postMatch) {
    const viewerId = getAuthUserId(req, tokenToUser, tokenMeta, userTokens);
    const id = decodeURIComponent(postMatch[1]);
    const post = posts.find((p) => p.id === id);
    if (!post) return json(res, 404, { error: "Not Found" });
    return json(res, 200, { item: viewPostDetail(post, viewerId) });
  }

  const likeMatch = url.pathname.match(/^\/posts\/([^/]+)\/like$/);
  if (req.method === "POST" && likeMatch) {
    const userId = getAuthUserId(req, tokenToUser, tokenMeta, userTokens);
    if (!userId) return json(res, 401, { error: "Unauthorized" });
    const id = decodeURIComponent(likeMatch[1]);
    const post = posts.find((p) => p.id === id);
    if (!post) return json(res, 404, { error: "Not Found" });

    ensureUser(userId);
    ensureUser(post.authorId);
    const exists = post.likeUserIds.includes(userId);
    markDirty();
    if (exists) {
      post.likeUserIds = post.likeUserIds.filter((u) => u !== userId);
    } else {
      post.likeUserIds.push(userId);
      if (post.authorId && post.authorId !== userId) {
        notifications.push({
          id: `n_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          toUserId: post.authorId,
          type: "like",
          title: "New like / 新点赞",
          content: `${users.get(userId).displayName}: ${post.title}`.slice(0, 200),
          createdAt: Date.now(),
        readAt: null,
        data: { postId: post.id, fromUserId: userId }
        });
      }
    }

    return json(res, 200, { liked: !exists, likeCount: post.likeUserIds.length });
  }

  const commentMatch = url.pathname.match(/^\/posts\/([^/]+)\/comments$/);
  if (req.method === "POST" && commentMatch) {
    const userId = getAuthUserId(req, tokenToUser, tokenMeta, userTokens);
    if (!userId) return json(res, 401, { error: "Unauthorized" });
    const id = decodeURIComponent(commentMatch[1]);
    const post = posts.find((p) => p.id === id);
    if (!post) return json(res, 404, { error: "Not Found" });

    ensureUser(userId);
    ensureUser(post.authorId);
    const body = await readJson(req).catch(() => null);
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    if (!content) return json(res, 400, { error: "content required" });

    const comment = {
      id: `c_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      authorId: userId,
      content,
      createdAt: Date.now()
    };
    markDirty();
    post.comments.push(comment);
    if (post.authorId && post.authorId !== userId) {
      notifications.push({
        id: `n_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        toUserId: post.authorId,
        type: "comment",
        title: `New comment / 新评论`,
        content: `${users.get(userId).displayName}: ${content}`.slice(0, 500),
        createdAt: Date.now(),
        readAt: null,
        data: { postId: post.id, fromUserId: userId }
      });
    }
    return json(res, 201, { item: comment });
  }

  const followMatch = url.pathname.match(/^\/users\/([^/]+)\/follow$/);
  if (req.method === "POST" && followMatch) {
    const userId = getAuthUserId(req, tokenToUser, tokenMeta, userTokens);
    if (!userId) return json(res, 401, { error: "Unauthorized" });
    const targetId = decodeURIComponent(followMatch[1]);
    if (!targetId) return json(res, 400, { error: "target required" });
    if (targetId === userId) return json(res, 400, { error: "cannot follow self" });

    ensureUser(userId);
    ensureUser(targetId);
    const set = follows.get(userId) || new Set();
    const isFollowing = set.has(targetId);
    markDirty();
    if (isFollowing) set.delete(targetId);
    else set.add(targetId);
    follows.set(userId, set);

    if (!isFollowing) {
      notifications.push({
        id: `n_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        toUserId: targetId,
        type: "follow",
        title: "New follower / 新关注",
        content: `${users.get(userId).displayName} (${userId})`.slice(0, 200),
        createdAt: Date.now(),
        readAt: null,
        data: { fromUserId: userId }
      });
    }

    return json(res, 200, { following: !isFollowing });
  }

  if (req.method === "GET" && url.pathname === "/users/me/following") {
    const userId = getAuthUserId(req, tokenToUser, tokenMeta, userTokens);
    if (!userId) return json(res, 401, { error: "Unauthorized" });
    const set = follows.get(userId) || new Set();
    return json(res, 200, { items: Array.from(set) });
  }

  if (req.method === "GET" && url.pathname === "/notifications") {
    const userId = getAuthUserId(req, tokenToUser, tokenMeta, userTokens);
    if (!userId) return json(res, 401, { error: "Unauthorized" });
    const items = notifications
      .filter((n) => n.toUserId === userId)
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        content: n.content,
        createdAt: n.createdAt,
        readAt: n.readAt,
        data: n.data || {}
      }));
    return json(res, 200, { items });
  }

  const notificationReadMatch = url.pathname.match(/^\/notifications\/([^/]+)\/read$/);
  if (req.method === "POST" && notificationReadMatch) {
    const userId = getAuthUserId(req, tokenToUser, tokenMeta, userTokens);
    if (!userId) return json(res, 401, { error: "Unauthorized" });
    const id = decodeURIComponent(notificationReadMatch[1]);
    const n = notifications.find((x) => x.id === id);
    if (!n || n.toUserId !== userId) return json(res, 404, { error: "Not Found" });
    if (!n.readAt) {
      markDirty();
      n.readAt = Date.now();
    }
    return json(res, 200, { ok: true, readAt: n.readAt });
  }

  if (req.method === "POST" && url.pathname === "/notifications/read-all") {
    const userId = getAuthUserId(req, tokenToUser, tokenMeta, userTokens);
    if (!userId) return json(res, 401, { error: "Unauthorized" });
    const now = Date.now();
    markDirty();
    for (const n of notifications) {
      if (n.toUserId === userId && !n.readAt) n.readAt = now;
    }
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: "Not Found" });
});

server.listen(PORT, () => {
  const port = typeof server.address === "function" ? server.address()?.port : PORT;
  process.stdout.write(`api listening on http://localhost:${port}\n`);
});

const AUTO_NORMALIZE_ON_START = String(process.env.AUTO_NORMALIZE_ON_START || "") === "1";
const AUTO_NORMALIZE_INTERVAL_MS = Number(process.env.AUTO_NORMALIZE_INTERVAL_MS || 0);
const AUTO_NORMALIZE_DRY_RUN = String(process.env.AUTO_NORMALIZE_DRY_RUN || "1") !== "0";
const runAutoNormalize = () => {
  try {
    const out = normalizeStoredChannels({ dryRun: AUTO_NORMALIZE_DRY_RUN });
    process.stdout.write(
      `auto normalizeChannels: dryRun=${out.dryRun} users=${out.usersUpdated} requests=${out.requestsUpdated} intros=${out.introductionsUpdated} contacts=${out.contactsUpdated} conflicts=${out.contactConflictCount}\n`
    );
  } catch (e) {
    process.stderr.write(`auto normalizeChannels failed: ${String(e && e.message ? e.message : e)}\n`);
  }
};
if (AUTO_NORMALIZE_ON_START) runAutoNormalize();
if (Number.isFinite(AUTO_NORMALIZE_INTERVAL_MS) && AUTO_NORMALIZE_INTERVAL_MS > 0) {
  const timer = setInterval(runAutoNormalize, Math.min(Math.max(10_000, AUTO_NORMALIZE_INTERVAL_MS), 7 * 24 * 60 * 60 * 1000));
  if (timer && typeof timer.unref === "function") timer.unref();
}

let currentPort = PORT;
let portTries = 0;
server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE" && portTries < MAX_PORT_TRIES) {
    portTries += 1;
    currentPort += 1;
    process.stdout.write(`port ${currentPort - 1} in use, trying http://localhost:${currentPort}\n`);
    setTimeout(() => {
      server.listen(currentPort, () => {
        const port = typeof server.address === "function" ? server.address()?.port : currentPort;
        process.stdout.write(`api listening on http://localhost:${port}\n`);
      });
    }, 50);
    return;
  }
  throw err;
});

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,x-admin-key");
}

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid json"));
      }
    });
    req.on("error", reject);
  });
}

function getAuthToken(req) {
  const raw = req.headers.authorization || "";
  const m = String(raw).match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1].trim();
  return token || null;
}

function isAdmin(req) {
  if (!ADMIN_KEY) return false;
  const key = String(req.headers["x-admin-key"] || "").trim();
  return key && key === ADMIN_KEY;
}

function revokeToken(token, tokenToUserMap, tokenMetaMap, userTokensMap) {
  if (!token) return;
  markDirty();
  const meta = tokenMetaMap.get(token);
  tokenToUserMap.delete(token);
  tokenMetaMap.delete(token);
  const userId = meta?.userId || null;
  if (userId) {
    const set = userTokensMap.get(userId);
    if (set && set.delete) {
      set.delete(token);
      if (set.size === 0) userTokensMap.delete(userId);
      else userTokensMap.set(userId, set);
    }
  }
}

function revokeAllUserTokens(userId, tokenToUserMap, tokenMetaMap, userTokensMap) {
  const set = userTokensMap.get(userId);
  if (!set || !set.size) return;
  for (const token of Array.from(set.values())) {
    revokeToken(token, tokenToUserMap, tokenMetaMap, userTokensMap);
  }
}

function getAuthUserId(req, tokenToUserMap, tokenMetaMap, userTokensMap) {
  const token = getAuthToken(req);
  if (!token) return null;
  const meta = tokenMetaMap.get(token);
  if (meta && typeof meta.expiresAt === "number" && Date.now() > meta.expiresAt) return null;
  return tokenToUserMap.get(token) || meta?.userId || null;
}

function issueTokenForUser(userId) {
  markDirty();
  const token = randomUUID();
  const createdAt = Date.now();
  const expiresAt = createdAt + TOKEN_TTL_MS;
  tokenToUser.set(token, userId);
  tokenMeta.set(token, { userId, createdAt, expiresAt });
  const userSet = userTokens.get(userId) || new Set();
  userSet.add(token);
  userTokens.set(userId, userSet);
  return { token, expiresAt };
}

function viewPostDetail(post, viewerId) {
  const viewerFollowing = viewerId ? follows.get(viewerId) : null;
  const authorFollowedByMe = viewerId && post.authorId ? Boolean(viewerFollowing && viewerFollowing.has(post.authorId)) : false;
  return {
    id: post.id,
    authorId: post.authorId,
    authorDisplayName: ensureUser(post.authorId).displayName,
    title: post.title,
    content: post.content,
    createdAt: post.createdAt,
    comments: post.comments,
    likeCount: post.likeUserIds.length,
    likedByMe: viewerId ? post.likeUserIds.includes(viewerId) : false,
    authorFollowedByMe
  };
}

function ensureUser(userId, opts) {
  const existing = users.get(userId);
  if (existing) return existing;
  markDirty();
  const displayName = userId === "system" ? "System" : `User ${userId.slice(-4)}`;
  const openid = typeof opts?.openid === "string" ? opts.openid : "";
  const u = {
    id: userId,
    displayName,
    openid,
    companyId: "",
    companyName: "",
    businesses: [],
    title: "",
    contactChannel: "",
    contactVisibility: "loggedIn",
    createdAt: Date.now()
  };
  users.set(userId, u);
  ensureUserStats(userId);
  return u;
}

function ensureUserStats(userId) {
  const existing = userStats.get(userId);
  if (existing) return existing;
  markDirty();
  const s = { points: 0, introSuccessCount: 0, introFailCount: 0 };
  userStats.set(userId, s);
  return s;
}

function getFollowerIds(targetId, followsMap) {
  const ids = [];
  for (const [followerId, set] of followsMap.entries()) {
    if (set && set.has && set.has(targetId)) ids.push(followerId);
  }
  return ids;
}

function getCompanyFollowerCount(companyId, companyFollowsMap) {
  let count = 0;
  for (const set of companyFollowsMap.values()) {
    if (set && set.has && set.has(companyId)) count += 1;
  }
  return count;
}

function normalizeCompany(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[\/\\]/g, "");
}

function normalizeBusiness(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function canonicalizeContactChannel(input) {
  const raw = String(input || "").trim().replace(/\s+/g, " ");
  if (!raw) return null;
  const compact = raw.replace(/\s+/g, "");
  const lower = compact.toLowerCase();

  if (/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(lower)) {
    return { kind: "email", display: `email: ${lower}` };
  }

  const digits = compact.replace(/[^\d]/g, "");
  if (digits.length >= 7 && digits.length <= 15) {
    const normalizedDigits = digits.startsWith("86") && digits.length === 13 ? digits.slice(2) : digits;
    return { kind: "mobile", display: `mobile: ${normalizedDigits}` };
  }

  const m = lower.match(/^(wechat|wx|weixin)[:：]?(.+)$/i);
  if (m) {
    const id = String(m[2] || "").trim().replace(/^@/, "").replace(/\s+/g, "");
    if (id) return { kind: "wechat", display: `wechat: ${id}` };
  }

  if (/^[a-z][-_a-z0-9]{4,19}$/i.test(lower)) {
    return { kind: "wechat", display: `wechat: ${lower}` };
  }

  return { kind: "other", display: raw };
}

function normalizeStoredChannels(opts) {
  const dryRun = Boolean(opts?.dryRun);

  let usersUpdated = 0;
  let requestsUpdated = 0;
  let introductionsUpdated = 0;
  let contactsUpdated = 0;

  const contactPlans = [];
  for (const u of users.values()) {
    const raw = String(u?.contactChannel || "").trim();
    if (!raw) continue;
    const normalized = canonicalizeContactChannel(raw)?.display || raw;
    if (normalized !== raw) {
      usersUpdated += 1;
      if (!dryRun) u.contactChannel = normalized.slice(0, 200);
    }
  }

  for (const r of requests) {
    const raw = String(r?.ownerContactChannel || "").trim();
    if (!raw) continue;
    const normalized = canonicalizeContactChannel(raw)?.display || raw;
    if (normalized !== raw) {
      requestsUpdated += 1;
      if (!dryRun) r.ownerContactChannel = normalized.slice(0, 200);
    }
  }

  for (const i of introductions) {
    const raw = String(i?.contactChannel || "").trim();
    if (!raw) continue;
    const normalized = canonicalizeContactChannel(raw)?.display || raw;
    if (normalized !== raw) {
      introductionsUpdated += 1;
      if (!dryRun) i.contactChannel = normalized.slice(0, 200);
    }
  }

  const computeKey = (ct, contactChannel) => {
    const channelKey = normalizeChannel(contactChannel);
    const businessKey = normalizeBusiness(ct.business || "");
    if (ct.companyId) return `${ct.companyId}|${businessKey}|${channelKey}`;
    return `${normalizeCompany(ct.companyName || "")}|${businessKey}|${channelKey}`;
  };

  for (const c of contacts) {
    const raw = String(c?.contactChannel || "").trim();
    const normalized = raw ? canonicalizeContactChannel(raw)?.display || raw : "";
    const nextKey = normalized ? computeKey(c, normalized) : String(c?.key || "");
    contactPlans.push({ id: c.id, raw, normalized, nextKey, currentKey: String(c?.key || "") });
  }
  const keyToIds = new Map();
  for (const p of contactPlans) {
    const k = String(p.nextKey || "");
    if (!k) continue;
    const arr = keyToIds.get(k) || [];
    arr.push(p.id);
    keyToIds.set(k, arr);
  }
  const conflicts = [];
  for (const [k, ids] of keyToIds.entries()) {
    if (ids.length > 1) conflicts.push({ key: k, ids });
  }
  const conflictKeySet = new Set(conflicts.map((x) => x.key));

  const now = Date.now();
  for (const p of contactPlans) {
    if (!p.normalized) continue;
    if (conflictKeySet.has(p.nextKey)) continue;
    if (p.normalized !== p.raw || p.nextKey !== p.currentKey) {
      contactsUpdated += 1;
      if (!dryRun) {
        const c = contacts.find((x) => x && x.id === p.id);
        if (!c) continue;
        c.contactChannel = p.normalized.slice(0, 200);
        c.key = p.nextKey;
        c.updatedAt = now;
      }
    }
  }

  if (!dryRun && (usersUpdated || requestsUpdated || introductionsUpdated || contactsUpdated)) {
    for (const u of users.values()) upsertSelfClaimedContactsFromUser(u);
    markDirty();
  }

  return {
    ok: true,
    dryRun,
    usersUpdated,
    requestsUpdated,
    introductionsUpdated,
    contactsUpdated,
    contactConflictCount: conflicts.length,
    contactConflicts: conflicts.slice(0, 50)
  };
}

function normalizeChannel(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function upsertSelfClaimedContactsFromUser(u) {
  const companyId = String(u?.companyId || "").trim();
  const companyName = String(u?.companyName || "").trim();
  const contactChannelRaw = String(u?.contactChannel || "").trim();
  const contactChannel = contactChannelRaw ? (canonicalizeContactChannel(contactChannelRaw)?.display || contactChannelRaw) : "";
  const contactName = String(u?.displayName || "").trim();
  const contactTitle = String(u?.title || "").trim();
  const businesses = Array.isArray(u?.businesses) ? u.businesses.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 20) : [];
  if (!companyId || !contactChannel || businesses.length === 0) return;

  const now = Date.now();
  for (const business of businesses) {
    const businessKey = normalizeBusiness(business);
    const channelKey = normalizeChannel(contactChannel);
    const key = `${companyId}|${businessKey}|${channelKey}`;
    const existing = contacts.find((c) => String(c?.key || "") === key);
    if (existing) {
      existing.companyId = companyId;
      existing.companyName = companyName;
      existing.business = business;
      if (contactName) existing.contactName = contactName.slice(0, 80);
      if (contactTitle) existing.contactTitle = contactTitle.slice(0, 120);
      existing.contactChannel = contactChannel.slice(0, 200);
      if (!existing.status) existing.status = "candidate";
      existing.updatedAt = now;
      existing.key = key;
      existing.selfClaimedAt = now;
      existing.sourceUserId = u.id;
      markDirty();
      continue;
    }
    const item = {
      id: `ct_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      key,
      companyId,
      companyName,
      business,
      contactName: contactName.slice(0, 80),
      contactTitle: contactTitle.slice(0, 120),
      contactChannel: contactChannel.slice(0, 200),
      clue: "",
      createdAt: now,
      updatedAt: now,
      status: "candidate",
      verifiedAt: 0,
      successCount: 0,
      failCount: 0,
      lastFailureAt: 0,
      lastFailureReason: "",
      selfClaimedAt: now,
      sourceUserId: u.id,
      createdByUserId: u.id,
      lastSourceIntroId: "",
      lastRequestId: ""
    };
    markDirty();
    contacts.push(item);
  }
}

function upsertVerifiedContactFromIntroduction(input) {
  const companyId = String(input?.companyId || "").trim();
  const companyName = String(input?.companyName || "").trim();
  const business = String(input?.business || "").trim();
  const intro = input?.intro;
  const requestId = String(input?.requestId || "").trim();
  if ((!companyId && !companyName) || !business || !intro) return null;
  const contactChannel = String(intro.contactChannel || "").trim();
  if (!contactChannel) return null;

  const businessKey = normalizeBusiness(business);
  const channelKey = normalizeChannel(contactChannel);
  const primaryKey = companyId ? `${companyId}|${businessKey}|${channelKey}` : `${normalizeCompany(companyName)}|${businessKey}|${channelKey}`;
  const fallbackKey = companyId && companyName ? `${normalizeCompany(companyName)}|${businessKey}|${channelKey}` : "";
  const existing =
    contacts.find((c) => String(c?.key || "") === primaryKey) ||
    (fallbackKey ? contacts.find((c) => String(c?.key || "") === fallbackKey) : null);
  const now = Date.now();
  if (existing) {
    if (companyId) existing.companyId = companyId;
    existing.companyName = companyName;
    existing.business = business;
    if (intro.contactName) existing.contactName = String(intro.contactName || "").trim().slice(0, 80);
    if (intro.contactTitle) existing.contactTitle = String(intro.contactTitle || "").trim().slice(0, 120);
    existing.contactChannel = contactChannel.slice(0, 200);
    if (intro.clue) existing.clue = String(intro.clue || "").trim().slice(0, 1000);
    existing.status = "verified";
    existing.verifiedAt = now;
    existing.successCount = Number(existing.successCount || 0) + 1;
    existing.failCount = Number(existing.failCount || 0);
    existing.lastSourceIntroId = String(intro.id || "");
    existing.lastRequestId = requestId;
    existing.updatedAt = now;
    existing.key = primaryKey;
    markDirty();
    return existing;
  }

  const item = {
    id: `ct_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    key: primaryKey,
    companyId,
    companyName,
    business,
    contactName: String(intro.contactName || "").trim().slice(0, 80),
    contactTitle: String(intro.contactTitle || "").trim().slice(0, 120),
    contactChannel: contactChannel.slice(0, 200),
    clue: String(intro.clue || "").trim().slice(0, 1000),
    createdAt: now,
    updatedAt: now,
    status: "verified",
    verifiedAt: now,
    successCount: 1,
    failCount: 0,
    lastFailureAt: 0,
    lastFailureReason: "",
    createdByUserId: String(intro.introducerId || ""),
    lastSourceIntroId: String(intro.id || ""),
    lastRequestId: requestId
  };
  markDirty();
  contacts.push(item);
  return item;
}

function upsertFailedContactFromIntroduction(input) {
  const companyId = String(input?.companyId || "").trim();
  const companyName = String(input?.companyName || "").trim();
  const business = String(input?.business || "").trim();
  const intro = input?.intro;
  const requestId = String(input?.requestId || "").trim();
  const reason = String(input?.reason || "").trim();
  if ((!companyId && !companyName) || !business || !intro) return null;
  const contactChannel = String(intro.contactChannel || "").trim();
  if (!contactChannel) return null;

  const businessKey = normalizeBusiness(business);
  const channelKey = normalizeChannel(contactChannel);
  const primaryKey = companyId ? `${companyId}|${businessKey}|${channelKey}` : `${normalizeCompany(companyName)}|${businessKey}|${channelKey}`;
  const fallbackKey = companyId && companyName ? `${normalizeCompany(companyName)}|${businessKey}|${channelKey}` : "";
  const existing =
    contacts.find((c) => String(c?.key || "") === primaryKey) ||
    (fallbackKey ? contacts.find((c) => String(c?.key || "") === fallbackKey) : null);
  const now = Date.now();

  const classify = (r) => {
    if (r === "left" || r === "refused") return "invalid";
    if (r === "unreachable") return "candidate";
    if (r === "mismatch") return "candidate";
    return "";
  };
  const nextStatus = classify(reason);

  if (existing) {
    if (companyId) existing.companyId = companyId;
    existing.companyName = companyName;
    existing.business = business;
    if (intro.contactName) existing.contactName = String(intro.contactName || "").trim().slice(0, 80);
    if (intro.contactTitle) existing.contactTitle = String(intro.contactTitle || "").trim().slice(0, 120);
    existing.contactChannel = contactChannel.slice(0, 200);
    if (intro.clue) existing.clue = String(intro.clue || "").trim().slice(0, 1000);
    existing.failCount = Number(existing.failCount || 0) + 1;
    existing.lastFailureAt = now;
    existing.lastFailureReason = reason;
    if (nextStatus) existing.status = nextStatus;
    else if (!existing.status) existing.status = "candidate";
    existing.lastSourceIntroId = String(intro.id || "");
    existing.lastRequestId = requestId;
    existing.updatedAt = now;
    existing.key = primaryKey;
    markDirty();
    return existing;
  }

  const item = {
    id: `ct_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    key: primaryKey,
    companyId,
    companyName,
    business,
    contactName: String(intro.contactName || "").trim().slice(0, 80),
    contactTitle: String(intro.contactTitle || "").trim().slice(0, 120),
    contactChannel: contactChannel.slice(0, 200),
    clue: String(intro.clue || "").trim().slice(0, 1000),
    createdAt: now,
    updatedAt: now,
    status: nextStatus || "candidate",
    verifiedAt: 0,
    successCount: 0,
    failCount: 1,
    lastFailureAt: now,
    lastFailureReason: reason,
    createdByUserId: String(intro.introducerId || ""),
    lastSourceIntroId: String(intro.id || ""),
    lastRequestId: requestId
  };
  markDirty();
  contacts.push(item);
  return item;
}

function paginateByCursor(list, cursor, limit, getId) {
  let startIndex = 0;
  if (cursor) {
    const idx = list.findIndex((x) => getId(x) === cursor);
    if (idx >= 0) startIndex = idx + 1;
  }
  const items = list.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < list.length;
  const nextCursor = hasMore && items.length > 0 ? getId(items[items.length - 1]) : null;
  return { items, hasMore, nextCursor };
}

function paginateIds(allIds, cursor, limit) {
  let startIndex = 0;
  if (cursor) {
    const idx = allIds.findIndex((id) => id === cursor);
    if (idx >= 0) startIndex = idx + 1;
  }
  const items = allIds.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < allIds.length;
  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1] : null;
  return { items, hasMore, nextCursor };
}

function hash(input) {
  let out = 0;
  for (let i = 0; i < input.length; i += 1) out = (out * 31 + input.charCodeAt(i)) >>> 0;
  return out.toString(16);
}

async function getWeChatOpenId(code) {
  const appid = String(process.env.WX_APPID || "").trim();
  const secret = String(process.env.WX_SECRET || "").trim();
  if (!appid || !secret) return `mock_${hash(code)}`;

  const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
  url.searchParams.set("appid", appid);
  url.searchParams.set("secret", secret);
  url.searchParams.set("js_code", String(code || ""));
  url.searchParams.set("grant_type", "authorization_code");

  try {
    const resp = await fetch(url.toString(), { method: "GET" });
    const data = await resp.json().catch(() => ({}));
    const openid = typeof data?.openid === "string" ? data.openid.trim() : "";
    if (openid) return openid;
    return `mock_${hash(code)}`;
  } catch {
    return `mock_${hash(code)}`;
  }
}
