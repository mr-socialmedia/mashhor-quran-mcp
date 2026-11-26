import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";

const PORT = 39391;
const BASE = `http://127.0.0.1:${PORT}`;
let proc;
const H = { "content-type": "application/json", accept: "application/json, text/event-stream" };
const rpc = (method, params, id = 1) => JSON.stringify({ jsonrpc: "2.0", id, method, params });

async function post(body, headers = {}) {
  return fetch(`${BASE}/mcp`, { method: "POST", headers: { ...H, ...headers }, body });
}
/* الاستجابة قد تأتي JSON أو SSE؛ نستخرج كائن JSON-RPC في الحالتين. */
async function parse(res) {
  const t = await res.text();
  const line = t.startsWith("{") ? t : t.split("\n").find(l => l.startsWith("data:")).slice(5);
  return JSON.parse(line);
}

before(async () => {
  proc = spawn(process.execPath, ["src/http-server.mjs"], { env: { ...process.env, PORT: String(PORT), RATE_LIMIT_PER_MIN: "1000" }, stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${BASE}/health`)).ok) return; } catch { /* لم يبدأ بعد */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error("الخادم لم يبدأ");
});
after(() => proc.kill("SIGTERM"));

test("health", async () => {
  const j = await (await fetch(`${BASE}/health`)).json();
  assert.equal(j.status, "ok");
});

test("tools/list returns the 8 tools", async () => {
  const j = await parse(await post(rpc("tools/list", {})));
  assert.deepEqual(j.result.tools.map(t => t.name).sort(),
    ["get_ayah", "get_hijri_date", "get_prayer_times", "get_surah_audio", "list_radio_stations", "list_reciters", "list_surahs", "search_quran"]);
});

test("list_surahs tool call", async () => {
  const j = await parse(await post(rpc("tools/call", { name: "list_surahs", arguments: {} })));
  const surahs = JSON.parse(j.result.content[0].text);
  assert.equal(surahs.length, 114);
  assert.equal(surahs[0].name, "الفاتحة");
});

test("invalid arguments are rejected, not crashed", async () => {
  const j = await parse(await post(rpc("tools/call", { name: "get_ayah", arguments: { surah: 999, ayah: 1 } })));
  assert.ok(j.error || j.result.isError);
});

test("disallowed Host is rejected", async () => {
  /* fetch لا يسمح بتعديل رأس Host، فنستخدم http مباشرة. */
  const status = await new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port: PORT, path: "/health", headers: { Host: "evil.example.com" } }, r => { r.resume(); resolve(r.statusCode); }).on("error", reject);
  });
  assert.equal(status, 403);
});

test("disallowed Origin is rejected, allowed Origin gets CORS", async () => {
  assert.equal((await post(rpc("tools/list", {}), { origin: "https://evil.example.com" })).status, 403);
  const ok = await post(rpc("tools/list", {}), { origin: "https://claude.ai" });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://claude.ai");
});

test("OPTIONS preflight, GET/DELETE 405, bad JSON 400, 404", async () => {
  assert.equal((await fetch(`${BASE}/mcp`, { method: "OPTIONS", headers: { origin: "https://claude.ai" } })).status, 204);
  assert.equal((await fetch(`${BASE}/mcp`)).status, 405);
  assert.equal((await fetch(`${BASE}/mcp`, { method: "DELETE" })).status, 405);
  assert.equal((await post("{not json")).status, 400);
  assert.equal((await fetch(`${BASE}/nope`)).status, 404);
});
