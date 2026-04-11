import { spawn } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";

function startServer(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["src/server.js"], {
      cwd: path.join(path.dirname(fileURLToPath(import.meta.url)), ".."),
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let resolved = false;
    const onLine = (line) => {
      const m = String(line).match(/api listening on http:\/\/localhost:(\d+)/);
      if (!m) return;
      resolved = true;
      resolve({ child, port: Number(m[1]) });
    };

    const onData = (buf) => {
      const text = buf.toString("utf-8");
      for (const line of text.split(/\r?\n/)) onLine(line);
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", reject);
    child.on("exit", (code) => {
      if (!resolved) reject(new Error(`server exited: ${code}`));
    });
  });
}

function stopServer(child) {
  return new Promise((resolve) => {
    child.once("exit", () => resolve());
    child.kill("SIGTERM");
  });
}

test("auth: login, me, logout", async () => {
  const { child, port } = await startServer({ PORT: "0", TOKEN_TTL_MS: "60000", REFRESH_GRACE_MS: "0" });
  try {
    const base = `http://localhost:${port}`;
    const loginResp = await fetch(`${base}/auth/wechat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "test_code_1" })
    });
    assert.equal(loginResp.status, 200);
    const login = await loginResp.json();
    assert.ok(login.token);

    const meResp = await fetch(`${base}/users/me`, { headers: { Authorization: `Bearer ${login.token}` } });
    assert.equal(meResp.status, 200);
    const me = await meResp.json();
    assert.ok(me.item?.id);

    const logoutResp = await fetch(`${base}/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${login.token}` } });
    assert.equal(logoutResp.status, 200);

    const meResp2 = await fetch(`${base}/users/me`, { headers: { Authorization: `Bearer ${login.token}` } });
    assert.equal(meResp2.status, 401);
  } finally {
    await stopServer(child);
  }
});

test("auth: refresh within grace", async () => {
  const { child, port } = await startServer({ PORT: "0", TOKEN_TTL_MS: "10", REFRESH_GRACE_MS: "60000" });
  try {
    const base = `http://localhost:${port}`;
    const loginResp = await fetch(`${base}/auth/wechat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "test_code_2" })
    });
    assert.equal(loginResp.status, 200);
    const login = await loginResp.json();
    assert.ok(login.token);

    await new Promise((r) => setTimeout(r, 20));
    const refreshResp = await fetch(`${base}/auth/refresh`, { method: "POST", headers: { Authorization: `Bearer ${login.token}` } });
    assert.equal(refreshResp.status, 200);
    const refreshed = await refreshResp.json();
    assert.ok(refreshed.token);
    assert.notEqual(refreshed.token, login.token);

    const meResp = await fetch(`${base}/users/me`, { headers: { Authorization: `Bearer ${refreshed.token}` } });
    assert.equal(meResp.status, 200);
  } finally {
    await stopServer(child);
  }
});

test("requests: owner contact visibility is respected", async () => {
  const { child, port } = await startServer({ PORT: "0", TOKEN_TTL_MS: "60000", REFRESH_GRACE_MS: "60000" });
  try {
    const base = `http://localhost:${port}`;

    const owner = await fetch(`${base}/auth/wechat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "owner_privacy" })
    }).then((r) => r.json());
    const viewer = await fetch(`${base}/auth/wechat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "viewer_privacy" })
    }).then((r) => r.json());

    const put = await fetch(`${base}/users/me`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ displayName: "Owner", contactChannel: "wechat: owner_demo", contactVisibility: "private" })
    });
    assert.equal(put.status, 200);

    const reqResp = await fetch(`${base}/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ title: "need owner", companyName: "Demo Co", content: "x", tags: ["订舱"] })
    });
    assert.equal(reqResp.status, 201);
    const created = await reqResp.json();
    const requestId = created.item.id;
    assert.ok(requestId);

    const viewResp = await fetch(`${base}/requests/${encodeURIComponent(requestId)}`, {
      headers: { Authorization: `Bearer ${viewer.token}` }
    });
    assert.equal(viewResp.status, 200);
    const viewed = await viewResp.json();
    assert.equal(viewed.item.ownerContactChannel || "", "");

    const ownerViewResp = await fetch(`${base}/requests/${encodeURIComponent(requestId)}`, {
      headers: { Authorization: `Bearer ${owner.token}` }
    });
    assert.equal(ownerViewResp.status, 200);
    const ownerViewed = await ownerViewResp.json();
    assert.equal(ownerViewed.item.ownerContactChannel, "wechat: owner_demo");
  } finally {
    await stopServer(child);
  }
});
