import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "db.json");

let dirty = false;
let saveTimer = null;
let saving = Promise.resolve();
let currentState = null;

export function markDirty() {
  dirty = true;
  scheduleSave();
}

export function initStore() {
  const state = {
    tokenToUser: new Map(),
    tokenMeta: new Map(),
    userTokens: new Map(),
    users: new Map(),
    userStats: new Map(),
    posts: [],
    requests: [],
    introductions: [],
    requestClaims: [],
    requestComplaints: [],
    contacts: [],
    companies: [],
    companyFollows: new Map(),
    notifications: [],
    follows: new Map()
  };

  currentState = state;
  try {
    loadIntoSync(state);
  } catch {}

  const flush = () => saveNow(state);
  process.on("SIGINT", () => {
    flush().finally(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    flush().finally(() => process.exit(0));
  });

  return state;
}

function loadIntoSync(target) {
  fsSync.mkdirSync(DATA_DIR, { recursive: true });
  if (!fsSync.existsSync(DB_PATH)) {
    applySnapshot(target, defaultState());
    markDirty();
    return;
  }
  const raw = fsSync.readFileSync(DB_PATH, "utf-8");
  if (!raw) {
    applySnapshot(target, defaultState());
    markDirty();
    return;
  }
  const parsed = JSON.parse(raw);
  applySnapshot(target, parsed);
}

async function loadInto(target) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const raw = await fs.readFile(DB_PATH, "utf-8").catch(() => "");
  if (!raw) {
    const seeded = defaultState();
    applySnapshot(target, seeded);
    await saveNow(target);
    return;
  }
  const parsed = JSON.parse(raw);
  applySnapshot(target, parsed);
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (currentState) saveNow(currentState).catch(() => {});
  }, 250);
}

async function saveNow(state) {
  if (!dirty) return;
  dirty = false;
  saving = saving.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const snapshot = snapshotState(state);
    const tmpPath = `${DB_PATH}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(snapshot, null, 2), "utf-8");
    await fs.rename(tmpPath, DB_PATH);
  });
  return saving;
}

function applySnapshot(target, s) {
  const posts = Array.isArray(s?.posts) ? s.posts : defaultState().posts;
  const requests = Array.isArray(s?.requests) ? s.requests : [];
  const introductions = Array.isArray(s?.introductions) ? s.introductions : [];
  const requestClaims = Array.isArray(s?.requestClaims) ? s.requestClaims : [];
  const requestComplaints = Array.isArray(s?.requestComplaints) ? s.requestComplaints : [];
  const contacts = Array.isArray(s?.contacts) ? s.contacts : [];
  const companies = Array.isArray(s?.companies) ? s.companies : defaultState().companies;
  const notifications = Array.isArray(s?.notifications) ? s.notifications : [];

  target.posts.splice(0, target.posts.length, ...posts);
  target.requests.splice(0, target.requests.length, ...requests);
  target.introductions.splice(0, target.introductions.length, ...introductions);
  target.requestClaims.splice(0, target.requestClaims.length, ...requestClaims);
  target.requestComplaints.splice(0, target.requestComplaints.length, ...requestComplaints);
  target.contacts.splice(0, target.contacts.length, ...contacts);
  target.companies.splice(0, target.companies.length, ...companies);
  target.notifications.splice(0, target.notifications.length, ...notifications);

  const tokenToUser = Array.isArray(s?.tokenToUser) ? s.tokenToUser : [];
  const tokenMeta = Array.isArray(s?.tokenMeta) ? s.tokenMeta : [];
  const userTokens = Array.isArray(s?.userTokens) ? s.userTokens : [];
  const users = Array.isArray(s?.users) ? s.users : [];
  const userStats = Array.isArray(s?.userStats) ? s.userStats : [];
  const companyFollows = Array.isArray(s?.companyFollows) ? s.companyFollows : [];
  const follows = Array.isArray(s?.follows) ? s.follows : [];

  target.tokenToUser.clear();
  for (const [k, v] of tokenToUser) target.tokenToUser.set(k, v);
  target.tokenMeta.clear();
  for (const [k, v] of tokenMeta) target.tokenMeta.set(k, v);
  target.userTokens.clear();
  for (const [uid, ids] of userTokens) target.userTokens.set(uid, new Set(Array.isArray(ids) ? ids : []));

  if (target.tokenMeta.size === 0 && target.tokenToUser.size > 0) {
    const now = Date.now();
    const ttlMs = 30 * 24 * 60 * 60 * 1000;
    for (const [token, userId] of target.tokenToUser.entries()) {
      target.tokenMeta.set(token, { userId, createdAt: now, expiresAt: now + ttlMs });
      const set = target.userTokens.get(userId) || new Set();
      set.add(token);
      target.userTokens.set(userId, set);
    }
    markDirty();
  }

  target.users.clear();
  for (const [k, v] of users) target.users.set(k, v);
  target.userStats.clear();
  for (const [k, v] of userStats) target.userStats.set(k, v);

  target.companyFollows.clear();
  for (const [uid, ids] of companyFollows) target.companyFollows.set(uid, new Set(Array.isArray(ids) ? ids : []));
  target.follows.clear();
  for (const [uid, ids] of follows) target.follows.set(uid, new Set(Array.isArray(ids) ? ids : []));
}

function snapshotState(state) {
  return {
    version: 1,
    tokenToUser: Array.from(state.tokenToUser.entries()),
    tokenMeta: Array.from(state.tokenMeta.entries()),
    userTokens: Array.from(state.userTokens.entries()).map(([uid, set]) => [uid, Array.from(set.values())]),
    users: Array.from(state.users.entries()),
    userStats: Array.from(state.userStats.entries()),
    posts: state.posts,
    requests: state.requests,
    introductions: state.introductions,
    requestClaims: state.requestClaims,
    requestComplaints: state.requestComplaints,
    contacts: state.contacts,
    companies: state.companies,
    companyFollows: Array.from(state.companyFollows.entries()).map(([uid, set]) => [uid, Array.from(set.values())]),
    follows: Array.from(state.follows.entries()).map(([uid, set]) => [uid, Array.from(set.values())]),
    notifications: state.notifications
  };
}

function defaultState() {
  const now = Date.now();
  return {
    version: 1,
    tokenToUser: [],
    tokenMeta: [],
    userTokens: [],
    users: [],
    userStats: [],
    posts: [
      {
        id: "p_seed_1",
        authorId: "system",
        title: "Welcome / 欢迎",
        content: "Shipping Circle API is running.\n海运圈服务端已启动。",
        createdAt: now - 60_000,
        comments: [],
        likeUserIds: []
      }
    ],
    requests: [],
    introductions: [],
    requestClaims: [],
    requestComplaints: [],
    contacts: [],
    companies: [
      {
        id: "c_seed_1",
        name: "示例公司 / Demo Co.",
        aliases: ["Demo Co", "示例公司", "示例公司/Demo Co"],
        region: "Shanghai",
        tags: ["订舱", "东南亚"],
        roles: [
          { business: "订舱", title: "负责人" },
          { business: "拖车", title: "负责人" }
        ],
        createdAt: now - 180_000
      }
    ],
    companyFollows: [],
    follows: [],
    notifications: []
  };
}
