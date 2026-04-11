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

test("users: tag subscriptions and subscribed requests filter", async () => {
  const { child, port } = await startServer({ PORT: "0", TOKEN_TTL_MS: "60000", REFRESH_GRACE_MS: "60000" });
  try {
    const base = `http://localhost:${port}`;

    const owner = await fetch(`${base}/auth/wechat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "owner_subs" })
    }).then((r) => r.json());
    const viewer = await fetch(`${base}/auth/wechat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "viewer_subs" })
    }).then((r) => r.json());

    const putResp = await fetch(`${base}/users/me/tag-subscriptions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${viewer.token}` },
      body: JSON.stringify({ tags: ["订舱"] })
    });
    assert.equal(putResp.status, 200);
    const put = await putResp.json();
    assert.deepEqual(put.items, ["订舱"]);

    const getResp = await fetch(`${base}/users/me/tag-subscriptions`, { headers: { Authorization: `Bearer ${viewer.token}` } });
    assert.equal(getResp.status, 200);
    const got = await getResp.json();
    assert.ok(Array.isArray(got.items));
    assert.ok(got.items.includes("订舱"));

    const r1 = await fetch(`${base}/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ title: "booking", companyName: "Demo Co", content: "x", tags: ["订舱"] })
    }).then((r) => r.json());
    const r2 = await fetch(`${base}/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ title: "customs", companyName: "Demo Co", content: "y", tags: ["报关"] })
    }).then((r) => r.json());
    assert.ok(r1.item?.id);
    assert.ok(r2.item?.id);

    const listResp = await fetch(`${base}/requests?subscribed=1&limit=50`, { headers: { Authorization: `Bearer ${viewer.token}` } });
    assert.equal(listResp.status, 200);
    const list = await listResp.json();
    assert.ok(Array.isArray(list.items));
    assert.ok(list.items.some((x) => x.id === r1.item.id));
    assert.ok(!list.items.some((x) => x.id === r2.item.id));
  } finally {
    await stopServer(child);
  }
});

