import test from "node:test";
import assert from "node:assert/strict";
import { verifyIdToken, clearKeyCache } from "../src/lib/verify-token.js";
import { makeSigner, claims, unsignedToken, JWKS_URL, jsonResponse } from "./helpers.js";

const PROJECT = "demo-voca";
const signer = await makeSigner("kid-1");
const fetchImpl = async (url) => {
  assert.equal(url, JWKS_URL);
  return jsonResponse({ keys: [signer.jwk] }, 200, { "cache-control": "public, max-age=600" });
};

test("올바른 토큰", async () => {
  clearKeyCache();
  const token = await signer.sign(claims(PROJECT));
  const user = await verifyIdToken(token, PROJECT, { fetchImpl });
  assert.equal(user.sub, "user-1");
});

test("다른 프로젝트·만료·위조 토큰은 거부", async () => {
  clearKeyCache();
  assert.equal(await verifyIdToken(await signer.sign(claims("other")), PROJECT, { fetchImpl }), null);
  assert.equal(await verifyIdToken(await signer.sign(claims(PROJECT, { exp: 1 })), PROJECT, { fetchImpl }), null);
  assert.equal(await verifyIdToken(await signer.sign(claims(PROJECT, { sub: "" })), PROJECT, { fetchImpl }), null);
  const token = await signer.sign(claims(PROJECT));
  const [h, , s] = token.split(".");
  const forged = `${h}.${Buffer.from(JSON.stringify(claims(PROJECT, { sub: "attacker" }))).toString("base64url")}.${s}`;
  assert.equal(await verifyIdToken(forged, PROJECT, { fetchImpl }), null);
  assert.equal(await verifyIdToken("not-a-token", PROJECT, { fetchImpl }), null);
});

test("모르는 kid 면 키를 다시 받아 본 뒤 거부", async () => {
  clearKeyCache();
  let calls = 0;
  const other = await makeSigner("kid-unknown");
  const counting = async (url) => {
    calls++;
    return fetchImpl(url);
  };
  assert.equal(await verifyIdToken(await other.sign(claims(PROJECT)), PROJECT, { fetchImpl: counting }), null);
  assert.equal(calls, 2);
});

test("서명 없는 토큰은 에뮬레이터 모드에서만 허용", async () => {
  const token = unsignedToken(claims(PROJECT));
  assert.equal(await verifyIdToken(token, PROJECT, { fetchImpl }), null);
  assert.equal((await verifyIdToken(token, PROJECT, { fetchImpl, emulator: true })).sub, "user-1");
});
