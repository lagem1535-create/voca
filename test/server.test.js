import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFirebaseConfig } from "../src/config.js";
import { verifyIdToken, _resetKeyCache } from "../src/auth.js";
import { normalizeBlank } from "../src/ai.js";
import { generateJson, modelChain } from "../src/gemini.js";
import worker from "../src/index.js";

const CFG = { apiKey: "k", projectId: "demo", appId: "a" };

test("FIREBASE_CONFIG: JSON, 콘솔 코드, 객체 모두 해석", () => {
  assert.equal(parseFirebaseConfig(JSON.stringify(CFG)).config.projectId, "demo");
  const code = `const firebaseConfig = {\n apiKey: "k",\n projectId: 'demo',\n databaseURL: "https://x.firebasedatabase.app/",\n};`;
  const { config } = parseFirebaseConfig(code);
  assert.equal(config.apiKey, "k");
  assert.equal(config.databaseURL, "https://x.firebasedatabase.app");
  assert.equal(config.authDomain, "demo.firebaseapp.com");
  assert.equal(parseFirebaseConfig(CFG).config.databaseURL, "https://demo-default-rtdb.firebaseio.com");
  assert.ok(parseFirebaseConfig("").error);
  assert.ok(parseFirebaseConfig('{"apiKey":"k"}').error);
});

test("빈칸 문장 표준화", () => {
  assert.equal(normalizeBlank("She ___ the plan.", "abandoned"), "She _____ the plan.");
  assert.equal(normalizeBlank("She abandoned the plan.", "abandoned"), "She _____ the plan.");
  assert.equal(normalizeBlank("No blank here.", "word"), null);
});

test("모델 순서: GEMINI_MODEL 우선, 중복 제거", () => {
  assert.deepEqual(modelChain({ GEMINI_MODEL: "models/a, gemini-2.5-flash" }).slice(0, 2), ["a", "gemini-2.5-flash"]);
});

test("Gemini: 404/429면 다음 모델로 넘어감", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (calls.length === 1) return new Response("{}", { status: 404 });
    return Response.json({ candidates: [{ content: { parts: [{ text: '{"items":[1]}' }] } }] });
  };
  const out = await generateJson({ AI_API: "x" }, "p", {}, { fetchImpl });
  assert.deepEqual(out, { items: [1] });
  assert.equal(calls.length, 2);
  await assert.rejects(generateJson({}, "p", {}), /AI_API/);
});

async function signedToken(payload, kid = "k1") {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = { ...(await crypto.subtle.exportKey("jwk", publicKey)), kid, alg: "RS256" };
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const data = `${enc({ alg: "RS256", kid })}.${enc(payload)}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(data));
  return { token: `${data}.${Buffer.from(sig).toString("base64url")}`, fetchImpl: async () => Response.json({ keys: [jwk] }) };
}

test("Firebase ID 토큰 검증", async () => {
  const now = Math.floor(Date.now() / 1000);
  const good = { aud: "demo", iss: "https://securetoken.google.com/demo", sub: "u1", iat: now, exp: now + 3600 };
  _resetKeyCache();
  const a = await signedToken(good);
  assert.equal((await verifyIdToken(a.token, "demo", { fetchImpl: a.fetchImpl })).sub, "u1");
  assert.equal(await verifyIdToken(a.token, "other", { fetchImpl: a.fetchImpl }), null);
  _resetKeyCache();
  const b = await signedToken({ ...good, exp: now - 10 });
  assert.equal(await verifyIdToken(b.token, "demo", { fetchImpl: b.fetchImpl }), null);
  const tampered = a.token.replace(/\.[^.]+\./, `.${Buffer.from(JSON.stringify({ ...good, sub: "evil" })).toString("base64url")}.`);
  _resetKeyCache();
  assert.equal(await verifyIdToken(tampered, "demo", { fetchImpl: a.fetchImpl }), null);
  assert.equal(await verifyIdToken("garbage", "demo"), null);
});

test("API 라우팅", async () => {
  const env = { FIREBASE_CONFIG: JSON.stringify(CFG), AI_API: "x" };
  const cfg = await worker.fetch(new Request("https://x/api/config"), env);
  assert.equal((await cfg.json()).firebase.projectId, "demo");
  const health = await (await worker.fetch(new Request("https://x/api/health"), {})).json();
  assert.equal(health.ok, false);
  const ai = await worker.fetch(new Request("https://x/api/ai/word", { method: "POST", body: "{}" }), env);
  assert.equal(ai.status, 401);
  assert.equal((await worker.fetch(new Request("https://x/api/nope"), env)).status, 404);
});
