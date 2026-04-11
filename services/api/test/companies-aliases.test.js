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

test("companies: user can add alias; resolve works", async () => {
  const { child, port } = await startServer({ PORT: "0" });
  try {
    const base = `http://localhost:${port}`;
    const login = await fetch(`${base}/auth/wechat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "alias_user" })
    }).then((r) => r.json());

    const created = await fetch(`${base}/companies`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${login.token}` },
      body: JSON.stringify({
        name: "Beta Logistics",
        region: "SH",
        tags: ["订舱"],
        roles: [{ business: "订舱", title: "负责人" }]
      })
    }).then((r) => r.json());
    assert.ok(created.item?.id);

    const addResp = await fetch(`${base}/companies/${encodeURIComponent(created.item.id)}/aliases`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${login.token}` },
      body: JSON.stringify({ alias: "Beta Log" })
    });
    assert.equal(addResp.status, 200);

    const resolved = await fetch(`${base}/companies/resolve?name=${encodeURIComponent("Beta Log")}`).then((r) => r.json());
    assert.equal(resolved.item.id, created.item.id);
  } finally {
    await stopServer(child);
  }
});

test("companies: alias conflict returns 409", async () => {
  const { child, port } = await startServer({ PORT: "0" });
  try {
    const base = `http://localhost:${port}`;
    const login = await fetch(`${base}/auth/wechat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "alias_user_conflict" })
    }).then((r) => r.json());

    const c1 = await fetch(`${base}/companies`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${login.token}` },
      body: JSON.stringify({
        name: "Gamma Logistics",
        region: "SH",
        tags: ["订舱"],
        roles: [{ business: "订舱", title: "负责人" }]
      })
    }).then((r) => r.json());
    const c2 = await fetch(`${base}/companies`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${login.token}` },
      body: JSON.stringify({
        name: "Delta Logistics",
        region: "SH",
        tags: ["订舱"],
        roles: [{ business: "订舱", title: "负责人" }]
      })
    }).then((r) => r.json());
    assert.ok(c1.item?.id);
    assert.ok(c2.item?.id);

    const addResp = await fetch(`${base}/companies/${encodeURIComponent(c2.item.id)}/aliases`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${login.token}` },
      body: JSON.stringify({ alias: "Gamma Logistics" })
    });
    assert.equal(addResp.status, 409);
  } finally {
    await stopServer(child);
  }
});

