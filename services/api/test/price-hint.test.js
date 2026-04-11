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

test("requests: priceHint uses historical quotes and quoteRange is present on detail", async () => {
  const { child, port } = await startServer({ PORT: "0", TOKEN_TTL_MS: "60000", REFRESH_GRACE_MS: "60000" });
  try {
    const base = `http://localhost:${port}`;

    const owner = await fetch(`${base}/auth/wechat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "owner_pricehint" })
    }).then((r) => r.json());
    const worker = await fetch(`${base}/auth/wechat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "worker_pricehint" })
    }).then((r) => r.json());

    const req1Resp = await fetch(`${base}/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ title: "need quote 1", companyName: "Demo Co", content: "x", tags: ["订舱"] })
    });
    assert.equal(req1Resp.status, 201);
    const req1 = await req1Resp.json();
    const requestId1 = req1.item.id;
    assert.ok(requestId1);

    const claimResp = await fetch(`${base}/requests/${encodeURIComponent(requestId1)}/claim`, {
      method: "POST",
      headers: { Authorization: `Bearer ${worker.token}` }
    });
    assert.equal(claimResp.status, 201);
    const claim = await claimResp.json();
    const claimId = claim.item.id;
    assert.ok(claimId);

    const ackResp = await fetch(`${base}/requests/${encodeURIComponent(requestId1)}/claims/${encodeURIComponent(claimId)}/ack`, {
      method: "POST",
      headers: { Authorization: `Bearer ${worker.token}` }
    });
    assert.equal(ackResp.status, 200);

    const quoteResp = await fetch(`${base}/requests/${encodeURIComponent(requestId1)}/claims/${encodeURIComponent(claimId)}/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${worker.token}` },
      body: JSON.stringify({ quoteCurrency: "USD", quoteAmount: 2000, quoteAllIn: true, quoteValidDays: 7, quoteNote: "USD 2000 all-in valid 7d" })
    });
    assert.equal(quoteResp.status, 200);

    const detail1 = await fetch(`${base}/requests/${encodeURIComponent(requestId1)}`, {
      headers: { Authorization: `Bearer ${owner.token}` }
    }).then((r) => r.json());
    assert.equal(detail1.item.quoteRange.currency, "USD");
    assert.equal(detail1.item.quoteRange.min, 2000);
    assert.equal(detail1.item.quoteRange.max, 2000);
    assert.equal(detail1.item.quoteRange.count, 1);

    const req2Resp = await fetch(`${base}/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${owner.token}` },
      body: JSON.stringify({ title: "need quote 2", companyName: "Demo Co", content: "y", tags: ["订舱"] })
    });
    assert.equal(req2Resp.status, 201);
    const req2 = await req2Resp.json();
    assert.ok(req2.item.priceHint);
    assert.equal(req2.item.priceHint.currency, "USD");
    assert.equal(req2.item.priceHint.min, 2000);
    assert.equal(req2.item.priceHint.max, 2000);
    assert.ok(req2.item.priceHint.count >= 1);
  } finally {
    await stopServer(child);
  }
});
