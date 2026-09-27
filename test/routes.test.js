import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import worker, { handleApi } from "../src/index.js";
import { _resetKeyCache } from "../src/lib/auth.js";
import { _resetGeminiState } from "../src/lib/gemini.js";
import { buildBlankQuestions, parseBlankRequest } from "../src/routes/ai-blank.js";
import { normalizeWordItems, parseWordRequest } from "../src/routes/ai-word.js";
import { DATABASE_URL, FIREBASE_CONFIG, createSigner, geminiResponse, jsonResponse, mockFetch } from "./helpers.js";

const signer = await createSigner();
const env = { AI_API: "test-key", FIREBASE_CONFIG };

beforeEach(() => {
  _resetKeyCache();
  _resetGeminiState();
});

function request(path, { method = "GET", body, token } = {}) {
  const headers = {};
  if (body) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request(`https://voca.test${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

/** Google 공개키 요청과 Gemini 요청을 흉내 냅니다. */
function mockGoogle(geminiHandler) {
  return mockFetch((url, init, body) => {
    if (url.includes("securetoken@system.gserviceaccount.com")) return jsonResponse({ keys: [signer.jwk] });
    if (url.includes(":generateContent")) return geminiHandler(body, url);
    throw new Error(`unexpected fetch ${url}`);
  });
}

test("알 수 없는 API 경로는 404, 잘못된 메서드는 405", async () => {
  assert.equal((await handleApi(request("/api/nope"), env)).status, 404);
  const res = await handleApi(request("/api/ai/word"), env);
  assert.equal(res.status, 405);
  assert.equal(res.headers.get("allow"), "POST");
});

test("정적 파일 요청은 ASSETS로 넘긴다", async () => {
  const assets = { fetch: async () => new Response("asset") };
  const res = await worker.fetch(request("/nothing-here"), { ...env, ASSETS: assets });
  assert.equal(await res.text(), "asset");
});

test("/api/config는 Firebase 설정만 돌려주고 비밀값은 내보내지 않는다", async () => {
  const res = await handleApi(request("/api/config"), env);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.firebase.projectId, "demo-voca");
  assert.equal(data.firebase.databaseURL, DATABASE_URL);
  assert.equal(data.emulators, undefined);
  assert.ok(!JSON.stringify(data).includes("test-key"));

  const missing = await handleApi(request("/api/config"), {});
  assert.equal(missing.status, 500);
  assert.equal((await missing.json()).code, "firebase_config_missing");
});

test("/api/health는 설정 여부만 알려준다", async () => {
  const data = await (await handleApi(request("/api/health"), env)).json();
  assert.equal(data.ok, true);
  assert.equal(data.firebaseConfig.projectId, "demo-voca");
  assert.deepEqual(data.database, { ok: true, url: DATABASE_URL });
  assert.ok(!JSON.stringify(data).includes("test-key"));
  const empty = await (await handleApi(request("/api/health"), {})).json();
  assert.equal(empty.ok, false);
  const noDatabase = await (await handleApi(request("/api/health"), { ...env, FIREBASE_CONFIG: '{"apiKey":"k","projectId":"p"}' })).json();
  assert.equal(noDatabase.ok, false);
  assert.equal(noDatabase.database.ok, false);
});

test("AI API는 로그인 토큰 없이는 401", async () => {
  const google = mockGoogle(() => geminiResponse({}));
  try {
    const res = await handleApi(request("/api/ai/word", { method: "POST", body: { words: ["apple"] } }), env);
    assert.equal(res.status, 401);
    assert.equal(google.calls.length, 0);
  } finally {
    google.restore();
  }
});

test("/api/ai/word: 뜻·예문을 만들어 입력 순서대로 돌려준다", async () => {
  const google = mockGoogle((body) => {
    assert.match(body.contents[0].parts[0].text, /"apple","recieve"/);
    return geminiResponse({
      items: [
        {
          word: "recieve",
          corrected: "receive",
          language: "en",
          partOfSpeech: "동사",
          pronunciation: "/rɪˈsiːv/",
          meaning: "받다",
          examples: [{ sentence: "I received a letter.", translation: "나는 편지를 받았다." }],
        },
        {
          word: "Apple",
          corrected: "",
          language: "EN",
          partOfSpeech: "명사",
          pronunciation: "/ˈæp.əl/",
          meaning: "사과",
          examples: [
            { sentence: "I eat an apple.", translation: "나는 사과를 먹는다." },
            { sentence: "Apples are red.", translation: "사과는 빨갛다." },
            { sentence: "extra", translation: "초과" },
          ],
        },
      ],
    });
  });
  try {
    const token = await signer.sign();
    const res = await handleApi(request("/api/ai/word", { method: "POST", token, body: { words: [" apple ", "recieve", "APPLE"], exampleCount: 2 } }), env);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.deepEqual(data.items.map((item) => item.word), ["apple", "recieve"]);
    assert.equal(data.items[0].language, "en");
    assert.equal(data.items[0].examples.length, 2);
    assert.equal(data.items[1].corrected, "receive");
    assert.deepEqual(data.missing, []);
    assert.ok(data.model);
  } finally {
    google.restore();
  }
});

test("/api/ai/word 입력 검증", () => {
  assert.throws(() => parseWordRequest({ words: [] }), /단어를 입력/);
  assert.throws(() => parseWordRequest({ words: Array.from({ length: 21 }, (_, i) => `w${i}`) }), /최대 20개/);
  assert.throws(() => parseWordRequest({ words: ["x".repeat(61)] }), /60자/);
  assert.deepEqual(parseWordRequest({ word: "hi", exampleCount: 9 }), { words: ["hi"], exampleCount: 3 });
  const { items, missing } = normalizeWordItems({ items: [{ word: "a", meaning: "" }] }, ["a", "b"], 2);
  assert.deepEqual(items, []);
  assert.deepEqual(missing, ["a", "b"]);
});

test("/api/ai/blank: 문장에서 정답 자리를 찾아 빈칸 문제를 만든다", async () => {
  const google = mockGoogle(() =>
    geminiResponse({
      questions: [
        { word: "run", answer: "ran", sentence: "She ran to catch the last bus home.", translation: "그녀는 막차를 타려고 달렸다." },
        { word: "apple", answer: "apples", sentence: "This sentence forgot the word.", translation: "..." },
      ],
    }),
  );
  try {
    const token = await signer.sign();
    const res = await handleApi(
      request("/api/ai/blank", {
        method: "POST",
        token,
        body: { items: [{ id: "w1", word: "run", meaning: "달리다" }, { id: "w2", word: "apple", meaning: "사과" }] },
      }),
      env,
    );
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.questions.length, 1);
    assert.deepEqual(data.questions[0], {
      id: "w1",
      word: "run",
      answer: "ran",
      before: "She ",
      after: " to catch the last bus home.",
      sentence: "She ran to catch the last bus home.",
      translation: "그녀는 막차를 타려고 달렸다.",
    });
    assert.deepEqual(data.missing, ["w2"]);
  } finally {
    google.restore();
  }
});

test("/api/ai/blank 입력 검증과 순서 대응", () => {
  assert.throws(() => parseBlankRequest({ items: [] }), /단어가 없습니다/);
  assert.throws(() => parseBlankRequest({ items: Array.from({ length: 21 }, (_, i) => ({ word: `w${i}` })) }), /최대 20문제/);
  const items = parseBlankRequest({ items: [{ word: "go" }, { word: "Go" }, { word: "see" }] });
  assert.equal(items.length, 2);
  // AI가 word를 빠뜨려도 개수가 같으면 순서로 대응
  const { questions } = buildBlankQuestions(
    { questions: [{ answer: "went", sentence: "I went home." }, { answer: "saw", sentence: "I saw it." }] },
    items,
  );
  assert.deepEqual(questions.map((q) => q.answer), ["went", "saw"]);
});

test("Gemini 오류는 코드와 한국어 메시지로 전달된다", async () => {
  const google = mockGoogle(() => jsonResponse({ error: { code: 429, message: "quota" } }, 429));
  try {
    const token = await signer.sign();
    const res = await handleApi(request("/api/ai/word", { method: "POST", token, body: { words: ["a"] } }), env);
    assert.equal(res.status, 429);
    const data = await res.json();
    assert.equal(data.code, "ai_quota");
    assert.match(data.error, /한도/);
  } finally {
    google.restore();
  }
});
