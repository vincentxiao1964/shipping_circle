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

test("requests: autoPing sends requestPing notifications to recommended users and is idempotent", async () => {
  const { child, port } = await startServer({ PORT: "0", TOKEN_TTL_MS: "60000", REFRESH_GRACE_MS: "60000" });
  try {
    const base = `http://localhost:${port}`;

    const owner = await fetch(`${base}/auth/wechat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "owner_autoping" })
    }).then((r) => r.json());

    const helper = await fetch(`${base}/auth/wechat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "helper_autoping" })
    }).then((r) => r.json());

    const reqResp = await fetch(`${base}/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ title: "need quote", companyName: "Demo Co", content: "x", tags: ["订舱"] })
    });
    assert.equal(reqResp.status, 201);
    const created = await reqResp.json();
    const requestId = created.item.id;
    const companyId = created.item.companyId;
    assert.ok(requestId);
    assert.ok(companyId);

    const followResp = await fetch(`${base}/companies/${encodeURIComponent(companyId)}/follow`, {
      method: "POST",
      headers: { Authorization: `Bearer ${helper.token}` }
    });
    assert.equal(followResp.status, 200);

    const auto1 = await fetch(`${base}/requests/${encodeURIComponent(requestId)}/autoPing`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ limit: 10 })
    });
    assert.equal(auto1.status, 200);
    const auto1Body = await auto1.json();
    assert.equal(auto1Body.ok, true);
    assert.ok(auto1Body.sent >= 1);

    const notifResp = await fetch(`${base}/notifications`, { headers: { Authorization: `Bearer ${helper.token}` } });
    assert.equal(notifResp.status, 200);
    const notifs = await notifResp.json();
    assert.ok(Array.isArray(notifs.items));
    assert.ok(notifs.items.some((n) => n.type === "requestPing" && n.data?.requestId === requestId));

    const auto2 = await fetch(`${base}/requests/${encodeURIComponent(requestId)}/autoPing`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ limit: 10 })
    });
    assert.equal(auto2.status, 200);
    const auto2Body = await auto2.json();
    assert.equal(auto2Body.ok, true);
    assert.ok(auto2Body.sent === 0);
    assert.ok(auto2Body.duplicated >= 1);
  } finally {
    await stopServer(child);
  }
});

