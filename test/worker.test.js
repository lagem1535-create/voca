import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { makeSigner, claims, JWKS_URL, jsonResponse, geminiResponse } from "./helpers.js";

const PROJECT = "demo-voca";
const signer = await makeSigner("kid-worker");
const token = await signer.sign(claims(PROJECT));

const env = {
  FIREBASE_CONFIG: JSON.stringify({ apiKey: "AIzaX", projectId: PROJECT, databaseURL: "https://demo-voca-default-rtdb.firebaseio.com", appId: "1:1:web:1" }),
  AI_API: "secret-gemini-key",
  ASSETS: { fetch: async (req) => new Response(`asset:${new URL(req.url).pathname}`) },
};

// 바깥으로 나가는 요청(Google 공개키, Gemini)을 가짜로 바꿉니다.
let gemini = null;
const geminiCalls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url === JWKS_URL) return jsonResponse({ keys: [signer.jwk] });
  if (url.startsWith("https://generativelanguage.googleapis.com/")) {
    const prompt = JSON.parse(init.body).contents[0].parts[0].text;
    geminiCalls.push({ url, prompt });
    return gemini(prompt, url);
  }
  throw new Error(`unexpected fetch: ${url}`);
};
test.after(() => {
  globalThis.fetch = realFetch;
});

function call(path, { method = "GET", body, auth = token, envOverride } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (auth) headers.authorization = `Bearer ${auth}`;
  const req = new Request(`https://voca.example${path}`, { method, headers, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  return worker.fetch(req, { ...env, ...envOverride }, {});
}

const listIn = (prompt, label) => JSON.parse(prompt.slice(prompt.indexOf(label) + label.length).trim());

function wordAnswer(prompt) {
  const words = listIn(prompt, "단어 목록:");
  return geminiResponse({
    items: words.map((w) => ({
      input: w,
      word: w.toLowerCase(),
      lang: "en",
      meaning: `${w}의 뜻`,
      pos: "동사",
      pronunciation: "/x/",
      examples: [{ sentence: `I ${w} it.`, translation: "나는 그것을 한다." }],
    })),
  });
}

test("API 가 아닌 경로는 정적 파일로 넘긴다", async () => {
  const res = await call("/words");
  assert.equal(await res.text(), "asset:/words");
});

test("GET /api/config", async () => {
  const res = await call("/api/config");
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.firebase.projectId, PROJECT);
  assert.equal(data.firebase.databaseURL, "https://demo-voca-default-rtdb.firebaseio.com");
  assert.equal(data.emulators, null);
  assert.ok(!JSON.stringify(data).includes("secret-gemini-key"));

  const missing = await call("/api/config", { envOverride: { FIREBASE_CONFIG: "" } });
  assert.equal(missing.status, 503);
  assert.match((await missing.json()).error, /FIREBASE_CONFIG/);
});

test("GET /api/health 는 비밀 값을 보여주지 않는다", async () => {
  const res = await call("/api/health");
  const text = await res.text();
  const data = JSON.parse(text);
  assert.equal(data.ok, true);
  assert.equal(data.ai, "ok");
  assert.ok(!text.includes("secret-gemini-key"));
  const bad = await (await call("/api/health", { envOverride: { AI_API: "" } })).json();
  assert.equal(bad.ok, false);
});

test("없는 API 404, 잘못된 방식 405", async () => {
  assert.equal((await call("/api/nope")).status, 404);
  assert.equal((await call("/api/ai/word")).status, 405);
  assert.equal((await call("/api/config/", { method: "GET" })).status, 200);
});

test("AI API 는 로그인 토큰이 필요", async () => {
  const res = await call("/api/ai/word", { method: "POST", body: { word: "abandon" }, auth: null });
  assert.equal(res.status, 401);
  const forged = await call("/api/ai/word", { method: "POST", body: { word: "abandon" }, auth: `${token.slice(0, -4)}AAAA` });
  assert.equal(forged.status, 401);
});

test("ALLOWED_EMAILS 에 없는 계정은 403", async () => {
  const res = await call("/api/ai/word", { method: "POST", body: { word: "abandon" }, envOverride: { ALLOWED_EMAILS: "owner@example.com" } });
  assert.equal(res.status, 403);
  gemini = wordAnswer;
  const ok = await call("/api/ai/word", { method: "POST", body: { word: "abandon" }, envOverride: { ALLOWED_EMAILS: "ME@example.com, other@x.com" } });
  assert.equal(ok.status, 200);
});

test("POST /api/ai/word — 한 단어", async () => {
  gemini = wordAnswer;
  const res = await call("/api/ai/word", { method: "POST", body: { word: "  Abandon " } });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.items.length, 1);
  assert.deepEqual(data.missing, []);
  assert.equal(data.items[0].input, "Abandon");
  assert.equal(data.items[0].word, "abandon");
  assert.equal(data.items[0].examples[0].translation, "나는 그것을 한다.");
});

test("POST /api/ai/word — 여러 단어는 10개씩 나눠 동시에, 실패한 묶음은 missing", async () => {
  geminiCalls.length = 0;
  // 두 번째 묶음(word10~word19)은 모든 모델이 한도 초과
  gemini = (prompt) => (prompt.includes('"word10"') ? jsonResponse({ error: { message: "quota" } }, 429) : wordAnswer(prompt));
  const words = Array.from({ length: 25 }, (_, i) => `word${i}`);
  const res = await call("/api/ai/word", { method: "POST", body: { words: [...words, "WORD0"] } });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(data.items.map((it) => it.input), [...words.slice(0, 10), ...words.slice(20)]);
  assert.deepEqual(data.missing, words.slice(10, 20));
  // 성공한 묶음 2번 + 실패한 묶음은 모델 4개 모두 시도
  assert.equal(geminiCalls.length, 2 + 4);
});

test("POST /api/ai/word — 모든 묶음이 실패하면 오류", async () => {
  gemini = () => jsonResponse({ error: { message: "quota" } }, 429);
  const res = await call("/api/ai/word", { method: "POST", body: { words: ["a", "b"] } });
  assert.equal(res.status, 429);
  assert.match((await res.json()).error, /한도/);
});

test("POST /api/ai/word — 입력 검사", async () => {
  assert.equal((await call("/api/ai/word", { method: "POST", body: { words: [] } })).status, 400);
  assert.equal((await call("/api/ai/word", { method: "POST", body: { words: Array.from({ length: 31 }, (_, i) => `w${i}`) } })).status, 400);
  assert.equal((await call("/api/ai/word", { method: "POST", body: "{bad json" })).status, 400);
});

test("POST /api/ai/word — AI 오류는 알아보기 쉬운 메시지", async () => {
  gemini = () => jsonResponse({ error: { message: "API key not valid. Please pass a valid API key." } }, 400);
  const res = await call("/api/ai/word", { method: "POST", body: { word: "abandon" } });
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /AI_API 키가 올바르지 않습니다/);
});

test("POST /api/ai/blank — 빈칸이 하나인 문제만 돌려준다", async () => {
  gemini = (prompt) => {
    const items = listIn(prompt, "목록:");
    return geminiResponse({
      items: items.map((it) => {
        if (it.id === "w1") return { id: "w1", sentence: "She _____ the plan.", answer: "abandoned", translation: "그녀는 계획을 포기했다." };
        if (it.id === "w2") return { id: "w2", sentence: "Please cease talking.", answer: "cease", translation: "말을 멈춰 주세요." };
        return { id: it.id, sentence: "No blank here.", answer: "zzz", translation: "" };
      }),
    });
  };
  const res = await call("/api/ai/blank", {
    method: "POST",
    body: { items: [{ id: "w1", word: "abandon", meaning: "포기하다" }, { id: "w2", word: "cease", meaning: "중단하다" }, { id: "w3", word: "brief", meaning: "짧은" }, { id: "", word: "x" }] },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(data.items.map((it) => it.id), ["w1", "w2"]);
  assert.equal(data.items[1].sentence, "Please _____ talking.");
  assert.deepEqual(data.missing, ["w3"]);
});

test("POST /api/ai/blank — 30문제 초과 400", async () => {
  const items = Array.from({ length: 31 }, (_, i) => ({ id: `i${i}`, word: `w${i}` }));
  assert.equal((await call("/api/ai/blank", { method: "POST", body: { items } })).status, 400);
});

test("너무 큰 요청은 413", async () => {
  const res = await call("/api/ai/word", { method: "POST", body: { words: ["x".repeat(70 * 1024)] } });
  assert.equal(res.status, 413);
});
