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

test("admin: contacts conflicts list and merge resolves duplicates", async () => {
  const { child, port } = await startServer({ PORT: "0", ADMIN_KEY: "admin_test_key", TOKEN_TTL_MS: "60000", REFRESH_GRACE_MS: "60000" });
  try {
    const base = `http://localhost:${port}`;

    const owner = await fetch(`${base}/auth/wechat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "owner_conflict" })
    }).then((r) => r.json());

    const intro = await fetch(`${base}/auth/wechat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "intro_conflict" })
    }).then((r) => r.json());

    const cA = await fetch(`${base}/companies`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ name: "Merge Co A", region: "SH", tags: ["订舱"], roles: [{ business: "订舱", title: "负责人" }] })
    }).then((r) => r.json());
    const cB = await fetch(`${base}/companies`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ name: "Merge Co B", region: "SH", tags: ["订舱"], roles: [{ business: "订舱", title: "负责人" }] })
    }).then((r) => r.json());
    assert.ok(cA.item?.id);
    assert.ok(cB.item?.id);

    const createReq = async (companyId, companyName) => {
      const resp = await fetch(`${base}/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
        body: JSON.stringify({ title: "need owner", companyId, companyName, content: "x", tags: ["订舱"] })
      });
      assert.equal(resp.status, 201);
      const data = await resp.json();
      return data.item.id;
    };
    const submitIntro = async (requestId) => {
      const resp = await fetch(`${base}/requests/${encodeURIComponent(requestId)}/introductions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${intro.token}` },
        body: JSON.stringify({
          contactName: "Nina",
          contactTitle: "订舱负责人",
          contactChannel: "wechat: nina_demo",
          clue: "",
          note: ""
        })
      });
      assert.equal(resp.status, 201);
      const data = await resp.json();
      return data.item.id;
    };
    const resolveIntro = async (introId) => {
      const resp = await fetch(`${base}/introductions/${encodeURIComponent(introId)}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
        body: JSON.stringify({ outcome: "success" })
      });
      assert.equal(resp.status, 200);
    };

    const rA = await createReq(cA.item.id, "Merge Co A");
    const iA = await submitIntro(rA);
    await resolveIntro(iA);

    const rB = await createReq(cB.item.id, "Merge Co B");
    const iB = await submitIntro(rB);
    await resolveIntro(iB);

    const mergeResp = await fetch(`${base}/admin/companies/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-key": "admin_test_key" },
      body: JSON.stringify({ sourceId: cB.item.id, targetId: cA.item.id })
    });
    assert.equal(mergeResp.status, 200);

    const conflictsResp = await fetch(`${base}/admin/contacts/conflicts?limit=20`, {
      headers: { "x-admin-key": "admin_test_key" }
    });
    assert.equal(conflictsResp.status, 200);
    const conflicts = await conflictsResp.json();
    assert.ok(Array.isArray(conflicts.items));
    const group = conflicts.items.find((g) => Array.isArray(g.ids) && g.ids.length >= 2 && String(g.key || "").startsWith(`${cA.item.id}|`));
    assert.ok(group);

    const keepId = group.ids[0];
    const removeIds = group.ids.slice(1);
    const mergeContactsResp = await fetch(`${base}/admin/contacts/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-key": "admin_test_key" },
      body: JSON.stringify({ keepId, removeIds })
    });
    assert.equal(mergeContactsResp.status, 200);

    const conflictsResp2 = await fetch(`${base}/admin/contacts/conflicts?limit=50`, {
      headers: { "x-admin-key": "admin_test_key" }
    });
    const conflicts2 = await conflictsResp2.json();
    assert.ok(Array.isArray(conflicts2.items));
    assert.ok(!conflicts2.items.some((g) => String(g.key || "") === String(group.key || "")));

    const listVerified = await fetch(
      `${base}/contacts/list?companyId=${encodeURIComponent(cA.item.id)}&statuses=${encodeURIComponent("verified")}`,
      { headers: { Authorization: `Bearer ${owner.token}` } }
    ).then((r) => r.json());
    const matches = (listVerified.items || []).filter((x) => x.contactChannel === "wechat: nina_demo");
    assert.equal(matches.length, 1);
    assert.equal(matches[0].successCount, 2);
  } finally {
    await stopServer(child);
  }
});

