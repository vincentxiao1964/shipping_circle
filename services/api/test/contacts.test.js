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

test("contacts: resolve success -> match returns verified contact", async () => {
  const { child, port } = await startServer({ PORT: "0", TOKEN_TTL_MS: "60000", REFRESH_GRACE_MS: "60000" });
  try {
    const base = `http://localhost:${port}`;

    const loginOwner = await fetch(`${base}/auth/wechat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "owner_code" })
    }).then((r) => r.json());

    const loginIntro = await fetch(`${base}/auth/wechat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "intro_code" })
    }).then((r) => r.json());

    const reqResp = await fetch(`${base}/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${loginOwner.token}` },
      body: JSON.stringify({ title: "need owner", companyName: "Demo Co", content: "x", tags: ["订舱"] })
    });
    assert.equal(reqResp.status, 201);
    const created = await reqResp.json();
    const requestId = created.item.id;
    assert.ok(requestId);

    const introResp = await fetch(`${base}/requests/${encodeURIComponent(requestId)}/introductions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${loginIntro.token}` },
      body: JSON.stringify({
        contactName: "Alice",
        contactTitle: "订舱负责人",
        contactChannel: "wechat: alice_demo",
        clue: "可直联",
        note: ""
      })
    });
    assert.equal(introResp.status, 201);
    const intro = await introResp.json();
    const introId = intro.item.id;
    assert.ok(introId);

    const resolveResp = await fetch(`${base}/introductions/${encodeURIComponent(introId)}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${loginOwner.token}` },
      body: JSON.stringify({ outcome: "success" })
    });
    assert.equal(resolveResp.status, 200);

    const matchResp = await fetch(`${base}/contacts/match?company=${encodeURIComponent("Demo Co")}&businesses=${encodeURIComponent("订舱")}`, {
      headers: { Authorization: `Bearer ${loginOwner.token}` }
    });
    assert.equal(matchResp.status, 200);
    const matched = await matchResp.json();
    assert.ok(Array.isArray(matched.items));
    assert.ok(matched.items.length >= 1);
    const group = matched.items.find((x) => x.business === "订舱" || String(x.business || "").includes("订舱"));
    assert.ok(group);
    assert.ok(Array.isArray(group.contacts));
    assert.ok(group.contacts.some((c) => c.contactChannel === "wechat: alice_demo"));
  } finally {
    await stopServer(child);
  }
});

test("contacts: feedback invalid removes contact from match", async () => {
  const { child, port } = await startServer({ PORT: "0", TOKEN_TTL_MS: "60000", REFRESH_GRACE_MS: "60000" });
  try {
    const base = `http://localhost:${port}`;

    const loginOwner = await fetch(`${base}/auth/wechat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "owner_code_invalid" })
    }).then((r) => r.json());

    const loginIntro = await fetch(`${base}/auth/wechat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "intro_code_invalid" })
    }).then((r) => r.json());

    const reqResp = await fetch(`${base}/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${loginOwner.token}` },
      body: JSON.stringify({ title: "need owner", companyName: "Demo Co", content: "x", tags: ["订舱"] })
    });
    assert.equal(reqResp.status, 201);
    const created = await reqResp.json();
    const requestId = created.item.id;
    assert.ok(requestId);

    const introResp = await fetch(`${base}/requests/${encodeURIComponent(requestId)}/introductions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${loginIntro.token}` },
      body: JSON.stringify({
        contactName: "Eve",
        contactTitle: "订舱负责人",
        contactChannel: "wechat: eve_demo",
        clue: "",
        note: ""
      })
    });
    assert.equal(introResp.status, 201);
    const intro = await introResp.json();
    const introId = intro.item.id;
    assert.ok(introId);

    const resolveResp = await fetch(`${base}/introductions/${encodeURIComponent(introId)}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${loginOwner.token}` },
      body: JSON.stringify({ outcome: "success" })
    });
    assert.equal(resolveResp.status, 200);

    const matchResp = await fetch(`${base}/contacts/match?company=${encodeURIComponent("Demo Co")}&businesses=${encodeURIComponent("订舱")}`, {
      headers: { Authorization: `Bearer ${loginOwner.token}` }
    });
    assert.equal(matchResp.status, 200);
    const matched = await matchResp.json();
    const group = matched.items.find((x) => x.business === "订舱" || String(x.business || "").includes("订舱"));
    assert.ok(group);
    const c = group.contacts.find((x) => x.contactChannel === "wechat: eve_demo");
    assert.ok(c?.id);

    const feedbackResp = await fetch(`${base}/contacts/${encodeURIComponent(c.id)}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${loginOwner.token}` },
      body: JSON.stringify({ action: "invalid", reason: "left" })
    });
    assert.equal(feedbackResp.status, 200);

    const matchResp2 = await fetch(`${base}/contacts/match?company=${encodeURIComponent("Demo Co")}&businesses=${encodeURIComponent("订舱")}`, {
      headers: { Authorization: `Bearer ${loginOwner.token}` }
    });
    assert.equal(matchResp2.status, 200);
    const matched2 = await matchResp2.json();
    assert.ok(Array.isArray(matched2.items));
    const group2 = matched2.items.find((x) => x.business === "订舱" || String(x.business || "").includes("订舱"));
    if (group2) assert.ok(!group2.contacts.some((x) => x.contactChannel === "wechat: eve_demo"));
  } finally {
    await stopServer(child);
  }
});

test("contacts: list returns stale and candidate", async () => {
  const { child, port } = await startServer({
    PORT: "0",
    TOKEN_TTL_MS: "60000",
    REFRESH_GRACE_MS: "60000",
    CONTACT_STALE_MS: "1"
  });
  try {
    const base = `http://localhost:${port}`;

    const loginOwner = await fetch(`${base}/auth/wechat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "owner_code_list" })
    }).then((r) => r.json());

    const loginIntro = await fetch(`${base}/auth/wechat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "intro_code_list" })
    }).then((r) => r.json());

    const reqResp = await fetch(`${base}/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${loginOwner.token}` },
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
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${loginIntro.token}` },
      body: JSON.stringify({
        contactName: "Ken",
        contactTitle: "订舱负责人",
        contactChannel: "wechat: ken_demo",
        clue: "",
        note: ""
      })
    });
    assert.equal(introResp.status, 201);
    const intro = await introResp.json();
    const introId = intro.item.id;
    assert.ok(introId);

    const resolveResp = await fetch(`${base}/introductions/${encodeURIComponent(introId)}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${loginOwner.token}` },
      body: JSON.stringify({ outcome: "fail", reason: "unreachable" })
    });
    assert.equal(resolveResp.status, 200);

    const listResp = await fetch(`${base}/contacts/list?companyId=${encodeURIComponent(companyId)}&statuses=${encodeURIComponent("candidate,stale")}`, {
      headers: { Authorization: `Bearer ${loginOwner.token}` }
    });
    assert.equal(listResp.status, 200);
    const listed = await listResp.json();
    assert.ok(Array.isArray(listed.items));
    assert.ok(listed.items.some((x) => x.contactChannel === "wechat: ken_demo"));
  } finally {
    await stopServer(child);
  }
});

test("contacts: stale is computed by verifiedAt", async () => {
  const { child, port } = await startServer({
    PORT: "0",
    TOKEN_TTL_MS: "60000",
    REFRESH_GRACE_MS: "60000",
    CONTACT_STALE_MS: "1"
  });
  try {
    const base = `http://localhost:${port}`;

    const loginOwner = await fetch(`${base}/auth/wechat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "owner_code_stale" })
    }).then((r) => r.json());

    const loginIntro = await fetch(`${base}/auth/wechat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "intro_code_stale" })
    }).then((r) => r.json());

    const reqResp = await fetch(`${base}/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${loginOwner.token}` },
      body: JSON.stringify({ title: "need owner", companyName: "Demo Co", content: "x", tags: ["订舱"] })
    });
    assert.equal(reqResp.status, 201);
    const created = await reqResp.json();
    const requestId = created.item.id;
    assert.ok(requestId);

    const introResp = await fetch(`${base}/requests/${encodeURIComponent(requestId)}/introductions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${loginIntro.token}` },
      body: JSON.stringify({
        contactName: "Bob",
        contactTitle: "订舱负责人",
        contactChannel: "wechat: bob_demo",
        clue: "",
        note: ""
      })
    });
    assert.equal(introResp.status, 201);
    const intro = await introResp.json();
    const introId = intro.item.id;
    assert.ok(introId);

    const resolveResp = await fetch(`${base}/introductions/${encodeURIComponent(introId)}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${loginOwner.token}` },
      body: JSON.stringify({ outcome: "success" })
    });
    assert.equal(resolveResp.status, 200);

    await new Promise((r) => setTimeout(r, 5));

    const matchResp = await fetch(`${base}/contacts/match?company=${encodeURIComponent("Demo Co")}&businesses=${encodeURIComponent("订舱")}`, {
      headers: { Authorization: `Bearer ${loginOwner.token}` }
    });
    assert.equal(matchResp.status, 200);
    const matched = await matchResp.json();
    const group = matched.items.find((x) => x.business === "订舱" || String(x.business || "").includes("订舱"));
    assert.ok(group);
    const c = group.contacts.find((x) => x.contactChannel === "wechat: bob_demo");
    assert.ok(c);
    assert.equal(c.status, "stale");
  } finally {
    await stopServer(child);
  }
});
