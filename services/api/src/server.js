import http from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT || 8787);

const tokenToUser = new Map();
const users = new Map();
const userStats = new Map();
const posts = [
  {
    id: "p_seed_1",
    authorId: "system",
    title: "Welcome / 欢迎",
    content: "Shipping Circle API is running.\n海运圈服务端已启动。",
    createdAt: Date.now() - 60_000,
    comments: [],
    likeUserIds: []
  }
];
const requests = [];
const introductions = [];
const companies = [
  {
    id: "c_seed_1",
    name: "示例公司 / Demo Co.",
    region: "Shanghai",
    tags: ["订舱", "东南亚"],
    roles: [
      { business: "订舱", title: "负责人" },
      { business: "拖车", title: "负责人" }
    ],
    createdAt: Date.now() - 180_000
  }
];
const companyFollows = new Map();
const notifications = [];
const follows = new Map();
const MAX_PORT_TRIES = 20;

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
        "GET /companies",
        "POST /companies",
        "GET /companies/:id",
        "POST /companies/:id/follow",
        "GET /companies/me/following",
        "GET /requests",
        "POST /requests",
        "GET /requests/:id",
        "PUT /requests/:id",
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
    const body = await readJson(req).catch(() => null);
    const code = body?.code;
    if (!code || typeof code !== "string") return json(res, 400, { error: "code required" });

    const userId = `u_${hash(code)}`;
    const token = randomUUID();
    tokenToUser.set(token, userId);
    ensureUser(userId);
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
      user: { id: userId, displayName: users.get(userId).displayName }
    });
  }

  if (req.method === "GET" && url.pathname === "/users/me") {
    const userId = getAuthUserId(req, tokenToUser);
    if (!userId) return json(res, 401, { error: "Unauthorized" });
    const u = ensureUser(userId);
    return json(res, 200, { item: { id: u.id, displayName: u.displayName } });
  }

  if (req.method === "PUT" && url.pathname === "/users/me") {
    const userId = getAuthUserId(req, tokenToUser);
    if (!userId) return json(res, 401, { error: "Unauthorized" });
    const body = await readJson(req).catch(() => null);
    const displayName = typeof body?.displayName === "string" ? body.displayName.trim() : "";
    if (!displayName) return json(res, 400, { error: "displayName required" });
    const u = ensureUser(userId);
    u.displayName = displayName.slice(0, 40);
    users.set(userId, u);
    return json(res, 200, { item: { id: u.id, displayName: u.displayName } });
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
    const viewerId = getAuthUserId(req, tokenToUser);
    const q = String(url.searchParams.get("q") || "").trim().toLowerCase();
    const cursor = String(url.searchParams.get("cursor") || "");
    const limitRaw = Number(url.searchParams.get("limit") || 20);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 50) : 20;

    const base = companies.slice().sort((a, b) => b.createdAt - a.createdAt);
    const filtered = q
      ? base.filter((c) => {
          if (String(c.name || "").toLowerCase().includes(q)) return true;
          if (String(c.region || "").toLowerCase().includes(q)) return true;
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
    const userId = getAuthUserId(req, tokenToUser);
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
    const userId = getAuthUserId(req, tokenToUser);
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
      region: region.slice(0, 80),
      tags,
      roles,
      createdAt: Date.now()
    };
    companies.push(item);
    return json(res, 201, { item });
  }

  const companyMatch = url.pathname.match(/^\/companies\/([^/]+)$/);
  if (req.method === "GET" && companyMatch) {
    const viewerId = getAuthUserId(req, tokenToUser);
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

  const companyFollowMatch = url.pathname.match(/^\/companies\/([^/]+)\/follow$/);
  if (req.method === "POST" && companyFollowMatch) {
    const userId = getAuthUserId(req, tokenToUser);
    if (!userId) return json(res, 401, { error: "Unauthorized" });
    const companyId = decodeURIComponent(companyFollowMatch[1]);
    const c = companies.find((x) => x.id === companyId);
    if (!c) return json(res, 404, { error: "Not Found" });
    const set = companyFollows.get(userId) || new Set();
    if (set.has(companyId)) set.delete(companyId);
    else set.add(companyId);
    companyFollows.set(userId, set);
    const followerCount = getCompanyFollowerCount(companyId, companyFollows);
    return json(res, 200, { following: set.has(companyId), followerCount });
  }

  if (req.method === "GET" && url.pathname === "/requests") {
    const viewerId = getAuthUserId(req, tokenToUser);
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
    const userId = getAuthUserId(req, tokenToUser);
    if (!userId) return json(res, 401, { error: "Unauthorized" });
    ensureUser(userId);
    ensureUserStats(userId);

    const body = await readJson(req).catch(() => null);
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    const companyName = typeof body?.companyName === "string" ? body.companyName.trim() : "";
    const tags = Array.isArray(body?.tags)
      ? body.tags.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 10)
      : [];
    if (!content) return json(res, 400, { error: "content required" });

    const reqItem = {
      id: `r_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      ownerId: userId,
      title: title || "Untitled",
      content: content.slice(0, 2000),
      companyName: companyName.slice(0, 120),
      tags,
      status: "open",
      createdAt: Date.now()
    };
    requests.push(reqItem);
    return json(res, 201, {
      item: {
        ...reqItem,
        ownerDisplayName: ensureUser(userId).displayName,
        introCount: 0,
        isMine: true
      }
    });
  }

  const requestMatch = url.pathname.match(/^\/requests\/([^/]+)$/);
  if (req.method === "GET" && requestMatch) {
    const viewerId = getAuthUserId(req, tokenToUser);
    const id = decodeURIComponent(requestMatch[1]);
    const r = requests.find((x) => x.id === id);
    if (!r) return json(res, 404, { error: "Not Found" });
    const isMine = viewerId ? r.ownerId === viewerId : false;
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
        ownerDisplayName: ensureUser(r.ownerId).displayName,
        title: r.title,
        content: r.content,
        companyName: r.companyName || "",
        tags: Array.isArray(r.tags) ? r.tags : [],
        status: r.status || "open",
        createdAt: r.createdAt,
        introCount: introItems.length,
        isMine
      },
      introductions: introItems
    });
  }

  if (req.method === "PUT" && requestMatch) {
    const userId = getAuthUserId(req, tokenToUser);
    if (!userId) return json(res, 401, { error: "Unauthorized" });
    const id = decodeURIComponent(requestMatch[1]);
    const r = requests.find((x) => x.id === id);
    if (!r) return json(res, 404, { error: "Not Found" });
    if (r.ownerId !== userId) return json(res, 403, { error: "Forbidden" });

    const body = await readJson(req).catch(() => null);
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    const companyName = typeof body?.companyName === "string" ? body.companyName.trim() : "";
    const status = typeof body?.status === "string" ? body.status.trim() : "";
    const tags = Array.isArray(body?.tags)
      ? body.tags.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 10)
      : null;

    if (title) r.title = title.slice(0, 80);
    if (content) r.content = content.slice(0, 2000);
    if (companyName) r.companyName = companyName.slice(0, 120);
    if (tags) r.tags = tags;
    if (status === "open" || status === "closed") r.status = status;

    return json(res, 200, {
      item: {
        id: r.id,
        ownerId: r.ownerId,
        ownerDisplayName: ensureUser(r.ownerId).displayName,
        title: r.title,
        content: r.content,
        companyName: r.companyName || "",
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
    const userId = getAuthUserId(req, tokenToUser);
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
    const contactChannel = typeof body?.contactChannel === "string" ? body.contactChannel.trim() : "";
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
    const userId = getAuthUserId(req, tokenToUser);
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
    const userId = getAuthUserId(req, tokenToUser);
    if (!userId) return json(res, 401, { error: "Unauthorized" });
    const id = decodeURIComponent(introResolveMatch[1]);
    const intro = introductions.find((x) => x.id === id);
    if (!intro) return json(res, 404, { error: "Not Found" });
    const r = requests.find((x) => x.id === intro.requestId);
    if (!r) return json(res, 404, { error: "Not Found" });
    if (r.ownerId !== userId) return json(res, 403, { error: "Forbidden" });

    const body = await readJson(req).catch(() => null);
    const outcome = typeof body?.outcome === "string" ? body.outcome.trim() : "";
    if (outcome !== "success" && outcome !== "fail") return json(res, 400, { error: "outcome must be success|fail" });
    if (intro.resolvedAt) return json(res, 400, { error: "already resolved" });

    intro.outcome = outcome;
    intro.resolvedAt = Date.now();

    const stats = ensureUserStats(intro.introducerId);
    if (outcome === "success") {
      stats.points += 5;
      stats.introSuccessCount += 1;
    } else {
      stats.points += 1;
      stats.introFailCount += 1;
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
    const viewerId = getAuthUserId(req, tokenToUser);

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
    const viewerId = getAuthUserId(req, tokenToUser);
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
    const userId = getAuthUserId(req, tokenToUser);
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
    posts.push(post);
    return json(res, 201, { item: viewPostDetail(post, userId) });
  }

  const postMatch = url.pathname.match(/^\/posts\/([^/]+)$/);
  if (req.method === "GET" && postMatch) {
    const viewerId = getAuthUserId(req, tokenToUser);
    const id = decodeURIComponent(postMatch[1]);
    const post = posts.find((p) => p.id === id);
    if (!post) return json(res, 404, { error: "Not Found" });
    return json(res, 200, { item: viewPostDetail(post, viewerId) });
  }

  const likeMatch = url.pathname.match(/^\/posts\/([^/]+)\/like$/);
  if (req.method === "POST" && likeMatch) {
    const userId = getAuthUserId(req, tokenToUser);
    if (!userId) return json(res, 401, { error: "Unauthorized" });
    const id = decodeURIComponent(likeMatch[1]);
    const post = posts.find((p) => p.id === id);
    if (!post) return json(res, 404, { error: "Not Found" });

    ensureUser(userId);
    ensureUser(post.authorId);
    const exists = post.likeUserIds.includes(userId);
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
    const userId = getAuthUserId(req, tokenToUser);
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
    const userId = getAuthUserId(req, tokenToUser);
    if (!userId) return json(res, 401, { error: "Unauthorized" });
    const targetId = decodeURIComponent(followMatch[1]);
    if (!targetId) return json(res, 400, { error: "target required" });
    if (targetId === userId) return json(res, 400, { error: "cannot follow self" });

    ensureUser(userId);
    ensureUser(targetId);
    const set = follows.get(userId) || new Set();
    const isFollowing = set.has(targetId);
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
    const userId = getAuthUserId(req, tokenToUser);
    if (!userId) return json(res, 401, { error: "Unauthorized" });
    const set = follows.get(userId) || new Set();
    return json(res, 200, { items: Array.from(set) });
  }

  if (req.method === "GET" && url.pathname === "/notifications") {
    const userId = getAuthUserId(req, tokenToUser);
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
    const userId = getAuthUserId(req, tokenToUser);
    if (!userId) return json(res, 401, { error: "Unauthorized" });
    const id = decodeURIComponent(notificationReadMatch[1]);
    const n = notifications.find((x) => x.id === id);
    if (!n || n.toUserId !== userId) return json(res, 404, { error: "Not Found" });
    if (!n.readAt) n.readAt = Date.now();
    return json(res, 200, { ok: true, readAt: n.readAt });
  }

  if (req.method === "POST" && url.pathname === "/notifications/read-all") {
    const userId = getAuthUserId(req, tokenToUser);
    if (!userId) return json(res, 401, { error: "Unauthorized" });
    const now = Date.now();
    for (const n of notifications) {
      if (n.toUserId === userId && !n.readAt) n.readAt = now;
    }
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: "Not Found" });
});

server.listen(PORT, () => {
  process.stdout.write(`api listening on http://localhost:${PORT}\n`);
});

let currentPort = PORT;
let portTries = 0;
server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE" && portTries < MAX_PORT_TRIES) {
    portTries += 1;
    currentPort += 1;
    process.stdout.write(`port ${currentPort - 1} in use, trying http://localhost:${currentPort}\n`);
    setTimeout(() => {
      server.listen(currentPort, () => {
        process.stdout.write(`api listening on http://localhost:${currentPort}\n`);
      });
    }, 50);
    return;
  }
  throw err;
});

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
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

function getAuthUserId(req, tokenToUserMap) {
  const raw = req.headers.authorization || "";
  const m = String(raw).match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1].trim();
  if (!token) return null;
  return tokenToUserMap.get(token) || null;
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

function ensureUser(userId) {
  const existing = users.get(userId);
  if (existing) return existing;
  const displayName = userId === "system" ? "System" : `User ${userId.slice(-4)}`;
  const u = { id: userId, displayName };
  users.set(userId, u);
  ensureUserStats(userId);
  return u;
}

function ensureUserStats(userId) {
  const existing = userStats.get(userId);
  if (existing) return existing;
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
