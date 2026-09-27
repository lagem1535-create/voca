import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { verifyFirebaseIdToken, requireUser, _resetKeyCache } from "../src/lib/auth.js";
import { HttpError } from "../src/lib/http.js";
import { PROJECT_ID, createSigner, unsignedToken, jsonResponse, mockFetch } from "./helpers.js";

const signer = await createSigner();
const jwksFetch = async () => jsonResponse({ keys: [signer.jwk] }, 200, { "cache-control": "public, max-age=100" });

beforeEach(() => _resetKeyCache());

test("올바른 서명 토큰을 통과시키고 uid를 돌려준다", async () => {
  const token = await signer.sign();
  const claims = await verifyFirebaseIdToken(token, PROJECT_ID, { fetchImpl: jwksFetch });
  assert.equal(claims.uid, "user-1");
  assert.equal(claims.email, "me@example.com");
});

test("공개키는 캐시해서 매번 받지 않는다", async () => {
  let count = 0;
  const fetchImpl = async () => {
    count++;
    return jwksFetch();
  };
  await verifyFirebaseIdToken(await signer.sign(), PROJECT_ID, { fetchImpl });
  await verifyFirebaseIdToken(await signer.sign(), PROJECT_ID, { fetchImpl });
  assert.equal(count, 1);
});

test("다른 프로젝트·만료·미래 발급·위조 토큰은 거부한다", async () => {
  const opts = { fetchImpl: jwksFetch };
  await assert.rejects(verifyFirebaseIdToken(await signer.sign({ aud: "other" }), PROJECT_ID, opts), /다른 Firebase 프로젝트/);
  await assert.rejects(verifyFirebaseIdToken(await signer.sign({ iss: "https://evil" }), PROJECT_ID, opts), /발급자/);
  const past = Math.floor(Date.now() / 1000) - 7200;
  await assert.rejects(verifyFirebaseIdToken(await signer.sign({ iat: past, exp: past + 3600 }), PROJECT_ID, opts), /만료/);
  const future = Math.floor(Date.now() / 1000) + 3600;
  await assert.rejects(verifyFirebaseIdToken(await signer.sign({ iat: future, exp: future + 3600 }), PROJECT_ID, opts), /발급 시각/);
  await assert.rejects(verifyFirebaseIdToken(await signer.sign({ sub: "" }), PROJECT_ID, opts), /사용자 정보/);

  const token = await signer.sign();
  const [h, , s] = token.split(".");
  const forgedPayload = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(token.split(".")[1], "base64url")), sub: "attacker" })).toString("base64url");
  await assert.rejects(verifyFirebaseIdToken(`${h}.${forgedPayload}.${s}`, PROJECT_ID, opts), /서명/);

  const other = await createSigner("other-kid");
  await assert.rejects(verifyFirebaseIdToken(await other.sign(), PROJECT_ID, opts), /서명 키/);
  await assert.rejects(verifyFirebaseIdToken(unsignedToken(), PROJECT_ID, opts), /서명 방식/);
  await assert.rejects(verifyFirebaseIdToken("abc", PROJECT_ID, opts), /형식/);
});

test("에뮬레이터 모드에서는 서명 없는 토큰도 클레임만 확인한다", async () => {
  const claims = await verifyFirebaseIdToken(unsignedToken(), PROJECT_ID, { emulator: true });
  assert.equal(claims.uid, "emu-user");
  await assert.rejects(verifyFirebaseIdToken(unsignedToken({ aud: "x" }), PROJECT_ID, { emulator: true }));
});

test("requireUser: 헤더 없음 → 401, 허용 목록 밖 → 403", async () => {
  const fetchMock = mockFetch(jwksFetch);
  try {
    const config = { projectId: PROJECT_ID };
    const noAuth = new Request("https://x/api/ai/word", { method: "POST" });
    await assert.rejects(requireUser(noAuth, {}, config), (err) => err instanceof HttpError && err.status === 401);

    const bad = new Request("https://x", { headers: { authorization: "Bearer nope.nope.nope" } });
    await assert.rejects(requireUser(bad, {}, config), (err) => err.status === 401 && err.code === "invalid_token");

    const good = new Request("https://x", { headers: { authorization: `Bearer ${await signer.sign()}` } });
    assert.equal((await requireUser(good, {}, config)).uid, "user-1");
    assert.equal((await requireUser(good, { ALLOWED_EMAILS: "ME@example.com, you@example.com" }, config)).uid, "user-1");
    await assert.rejects(requireUser(good, { ALLOWED_EMAILS: "someone@example.com" }, config), (err) => err.status === 403);
  } finally {
    fetchMock.restore();
  }
});
