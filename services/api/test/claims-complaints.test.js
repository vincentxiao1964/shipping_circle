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

test("claims: complain reduces points and removes from recommendation", async () => {
  const { child, port } = await startServer({
    PORT: "0",
    TOKEN_TTL_MS: "60000",
    REFRESH_GRACE_MS: "60000",
    COMPLAINT_BLOCK_THRESHOLD: "1"
  });
  try {
    const base = `http://localhost:${port}`;

    const owner = await fetch(`${base}/auth/wechat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "owner_claim" })
    }).then((r) => r.json());
    const worker = await fetch(`${base}/auth/wechat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "worker_claim" })
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
      headers: { Authorization: `Bearer ${worker.token}` }
    });
    assert.equal(followResp.status, 200);

    const recResp1 = await fetch(`${base}/requests/${encodeURIComponent(requestId)}/recommend-introducers?limit=10`, {
      headers: { Authorization: `Bearer ${owner.token}` }
    });
    assert.equal(recResp1.status, 200);
    const rec1 = await recResp1.json();
    assert.ok(Array.isArray(rec1.items));
    assert.ok(rec1.items.some((x) => x.id === worker.user.id));

    const claimResp = await fetch(`${base}/requests/${encodeURIComponent(requestId)}/claim`, {
      method: "POST",
      headers: { Authorization: `Bearer ${worker.token}` }
    });
    assert.equal(claimResp.status, 201);
    const claim = await claimResp.json();
    assert.equal(claim.ok, true);
    assert.ok(claim.item?.id);

    const complainResp = await fetch(`${base}/requests/${encodeURIComponent(requestId)}/claims/${encodeURIComponent(claim.item.id)}/complain`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ reason: "no_response" })
    });
    assert.equal(complainResp.status, 200);

    const statsResp = await fetch(`${base}/users/${encodeURIComponent(worker.user.id)}/stats`);
    assert.equal(statsResp.status, 200);
    const stats = await statsResp.json();
    assert.equal(stats.item.complaintCount, 1);
    assert.ok(stats.item.points <= 0);

    const recResp2 = await fetch(`${base}/requests/${encodeURIComponent(requestId)}/recommend-introducers?limit=10`, {
      headers: { Authorization: `Bearer ${owner.token}` }
    });
    assert.equal(recResp2.status, 200);
    const rec2 = await recResp2.json();
    assert.ok(Array.isArray(rec2.items));
    assert.ok(!rec2.items.some((x) => x.id === worker.user.id));
  } finally {
    await stopServer(child);
  }
});

