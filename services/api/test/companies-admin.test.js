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

test("companies: resolve by alias; admin merge", async () => {
  const { child, port } = await startServer({ PORT: "0", ADMIN_KEY: "admin_test_key" });
  try {
    const base = `http://localhost:${port}`;

    const login = await fetch(`${base}/auth/wechat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "company_admin_owner" })
    }).then((r) => r.json());

    const c1 = await fetch(`${base}/companies`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${login.token}` },
      body: JSON.stringify({
        name: "Alpha Logistics",
        region: "SH",
        tags: ["订舱"],
        roles: [{ business: "订舱", title: "负责人" }]
      })
    }).then((r) => r.json());
    assert.ok(c1.item?.id);

    const c2 = await fetch(`${base}/companies`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${login.token}` },
      body: JSON.stringify({
        name: "Alpha Logistics (CN)",
        region: "SH",
        tags: ["订舱"],
        roles: [{ business: "订舱", title: "负责人" }]
      })
    }).then((r) => r.json());
    assert.ok(c2.item?.id);

    const aliasResp = await fetch(`${base}/admin/companies/${encodeURIComponent(c2.item.id)}/aliases`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-admin-key": "admin_test_key" },
      body: JSON.stringify({ add: ["Alpha Logistics CN"] })
    });
    assert.equal(aliasResp.status, 200);

    const resolved = await fetch(`${base}/companies/resolve?name=${encodeURIComponent("Alpha Logistics CN")}`).then((r) => r.json());
    assert.equal(resolved.item.id, c2.item.id);

    const mergeResp = await fetch(`${base}/admin/companies/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-key": "admin_test_key" },
      body: JSON.stringify({ sourceId: c1.item.id, targetId: c2.item.id })
    });
    assert.equal(mergeResp.status, 200);

    const resolved2 = await fetch(`${base}/companies/resolve?name=${encodeURIComponent("Alpha Logistics")}`).then((r) => r.json());
    assert.equal(resolved2.item.id, c2.item.id);
  } finally {
    await stopServer(child);
  }
});

