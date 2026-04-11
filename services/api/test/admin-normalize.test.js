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

test("admin: normalizeChannels canonicalizes contactChannel and keys", async () => {
  const { child, port } = await startServer({ PORT: "0", ADMIN_KEY: "admin_test_key" });
  try {
    const base = `http://localhost:${port}`;

    const owner = await fetch(`${base}/auth/wechat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "owner_norm" })
    }).then((r) => r.json());

    const intro = await fetch(`${base}/auth/wechat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "intro_norm" })
    }).then((r) => r.json());

    const reqResp = await fetch(`${base}/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ title: "need owner", companyName: "Demo Co", content: "x", tags: ["订舱"] })
    });
    assert.equal(reqResp.status, 201);
    const created = await reqResp.json();
    const requestId = created.item.id;
    const companyId = created.item.companyId;
    assert.ok(requestId);
    assert.ok(companyId);

    const introResp = await fetch(`${base}/requests/${encodeURIComponent(requestId)}/introductions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${intro.token}` },
      body: JSON.stringify({
        contactName: "Dora",
        contactTitle: "订舱负责人",
        contactChannel: "wechat: dora_demo",
        clue: "",
        note: ""
      })
    });
    assert.equal(introResp.status, 201);
    const introItem = await introResp.json();
    const introId = introItem.item.id;
    assert.ok(introId);

    const resolveResp = await fetch(`${base}/introductions/${encodeURIComponent(introId)}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ outcome: "success" })
    });
    assert.equal(resolveResp.status, 200);

    const listVerified = await fetch(
      `${base}/contacts/list?companyId=${encodeURIComponent(companyId)}&statuses=${encodeURIComponent("verified")}`,
      { headers: { Authorization: `Bearer ${owner.token}` } }
    ).then((r) => r.json());
    const contact = (listVerified.items || []).find((x) => x.contactChannel === "wechat: dora_demo");
    assert.ok(contact?.id);

    const updResp = await fetch(`${base}/contacts/batchUpdate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ op: "replaceChannel", ids: [contact.id], from: "wechat:", to: "wx:" })
    });
    assert.equal(updResp.status, 200);

    const listVerified2 = await fetch(
      `${base}/contacts/list?companyId=${encodeURIComponent(companyId)}&statuses=${encodeURIComponent("verified")}`,
      { headers: { Authorization: `Bearer ${owner.token}` } }
    ).then((r) => r.json());
    assert.ok((listVerified2.items || []).some((x) => x.contactChannel.startsWith("wx:")));

    const adminResp = await fetch(`${base}/admin/normalizeChannels`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-key": "admin_test_key" },
      body: JSON.stringify({ dryRun: false })
    });
    assert.equal(adminResp.status, 200);
    const normalized = await adminResp.json();
    assert.equal(normalized.ok, true);
    assert.ok(normalized.contactsUpdated >= 1);

    const listVerified3 = await fetch(
      `${base}/contacts/list?companyId=${encodeURIComponent(companyId)}&statuses=${encodeURIComponent("verified")}`,
      { headers: { Authorization: `Bearer ${owner.token}` } }
    ).then((r) => r.json());
    assert.ok((listVerified3.items || []).some((x) => x.contactChannel === "wechat: dora_demo"));
  } finally {
    await stopServer(child);
  }
});

