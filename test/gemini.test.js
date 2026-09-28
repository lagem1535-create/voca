import test from "node:test";
import assert from "node:assert/strict";
import { generateJson, modelList, parseJsonText, DEFAULT_MODELS } from "../src/lib/gemini.js";
import { HttpError } from "../src/lib/http.js";
import { geminiResponse, jsonResponse } from "./helpers.js";

const env = { AI_API: "test-key" };
const req = { prompt: "hi", schema: { type: "OBJECT" } };

test("모델 순서: GEMINI_MODEL 먼저, 기본 모델 뒤에", () => {
  assert.deepEqual(modelList({}), DEFAULT_MODELS);
  assert.deepEqual(modelList({ GEMINI_MODEL: "models/my-model, gemini-3.6-flash" }).slice(0, 2), ["my-model", "gemini-3.6-flash"]);
  assert.equal(new Set(modelList({ GEMINI_MODEL: DEFAULT_MODELS[0] })).size, DEFAULT_MODELS.length);
});

test("JSON 파싱: 코드블록, 앞뒤 잡음 허용", () => {
  assert.deepEqual(parseJsonText('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonText('여기 있어요: {"a":2} 끝'), { a: 2 });
  assert.equal(parseJsonText("nope"), undefined);
});

test("키를 헤더로 보내고 JSON 응답을 돌려준다", async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, init, body: JSON.parse(init.body) };
    return geminiResponse({ items: [1, 2] });
  };
  const out = await generateJson(env, req, { fetchImpl });
  assert.deepEqual(out, { items: [1, 2] });
  assert.match(seen.url, /\/v1beta\/models\/gemini-3\.6-flash:generateContent$/);
  assert.equal(seen.init.headers["x-goog-api-key"], "test-key");
  assert.equal(seen.body.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(seen.body.generationConfig.thinkingConfig, { thinkingBudget: 1024 });
});

test("404·429 면 다음 모델로 넘어간다", async () => {
  const tried = [];
  const fetchImpl = async (url) => {
    tried.push(url.match(/models\/(.+):/)[1]);
    if (tried.length === 1) return jsonResponse({ error: { message: "not found" } }, 404);
    if (tried.length === 2) return jsonResponse({ error: { message: "quota" } }, 429);
    return geminiResponse({ ok: true });
  };
  assert.deepEqual(await generateJson(env, req, { fetchImpl }), { ok: true });
  assert.deepEqual(tried, DEFAULT_MODELS.slice(0, 3));
});

test("thinking 설정을 거부하면 같은 모델로 설정 없이 다시 보낸다", async () => {
  const bodies = [];
  const fetchImpl = async (url, init) => {
    bodies.push(JSON.parse(init.body));
    if (bodies.length === 1) return jsonResponse({ error: { message: "Thinking budget is not supported for this model." } }, 400);
    return geminiResponse({ ok: 1 });
  };
  await generateJson(env, req, { fetchImpl });
  assert.equal(bodies.length, 2);
  assert.ok(bodies[0].generationConfig.thinkingConfig);
  assert.equal(bodies[1].generationConfig.thinkingConfig, undefined);
});

test("잘못된 키는 바로 오류, 모두 한도 초과면 429", async () => {
  await assert.rejects(
    generateJson(env, req, { fetchImpl: async () => jsonResponse({ error: { message: "API key not valid. Please pass a valid API key." } }, 400) }),
    (err) => err instanceof HttpError && /AI_API 키가 올바르지 않습니다/.test(err.message),
  );
  await assert.rejects(
    generateJson(env, req, { fetchImpl: async () => jsonResponse({ error: { message: "quota" } }, 429) }),
    (err) => err.status === 429,
  );
});

test("AI_API 가 없으면 503", async () => {
  await assert.rejects(generateJson({}, req, { fetchImpl: async () => geminiResponse({}) }), (err) => err.status === 503);
});

test("thought 파트는 무시하고, 안전 필터 차단은 422", async () => {
  const fetchImpl = async () =>
    jsonResponse({ candidates: [{ content: { parts: [{ text: "생각…", thought: true }, { text: '{"x":1}' }] } }] });
  assert.deepEqual(await generateJson(env, req, { fetchImpl }), { x: 1 });
  await assert.rejects(
    generateJson(env, req, { fetchImpl: async () => jsonResponse({ promptFeedback: { blockReason: "SAFETY" } }) }),
    (err) => err.status === 422,
  );
});

test("GEMINI_BASE_URL 로 주소를 바꿀 수 있다", async () => {
  let seen;
  await generateJson({ ...env, GEMINI_BASE_URL: "https://gateway.example/v1beta/" }, req, {
    fetchImpl: async (url) => {
      seen = url;
      return geminiResponse({});
    },
  });
  assert.equal(seen, "https://gateway.example/v1beta/models/gemini-3.6-flash:generateContent");
});

test("전체 시간 제한을 넘기면 남은 모델은 건너뛴다", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return jsonResponse({ error: { message: "overloaded" } }, 503);
  };
  await assert.rejects(generateJson(env, req, { fetchImpl, totalMs: 0 }), (err) => err.status === 502);
  assert.equal(calls, 1);
});
