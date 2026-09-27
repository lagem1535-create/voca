import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { generateJson, modelChain, parseJsonLoose, _resetGeminiState, DEFAULT_MODELS } from "../src/lib/gemini.js";
import { geminiResponse, jsonResponse } from "./helpers.js";

beforeEach(() => _resetGeminiState());

const base = { system: "sys", prompt: "hi", schema: { type: "object" } };

function recorder(handler) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    const model = /models\/([^:]+):/.exec(url)[1];
    calls.push({ url, model, body, headers: init.headers });
    return handler({ model, body, index: calls.length - 1 });
  };
  return { calls, fetchImpl };
}

test("AI_API 키가 없으면 설정 안내 오류", async () => {
  await assert.rejects(generateJson({ env: {}, ...base }), (err) => err.code === "ai_key_missing" && err.status === 500);
});

test("첫 모델로 JSON을 받아오고 키는 헤더로 보낸다", async () => {
  const { calls, fetchImpl } = recorder(() => geminiResponse({ ok: 1 }));
  const result = await generateJson({ env: { AI_API: "k" }, ...base, fetchImpl });
  assert.deepEqual(result, { data: { ok: 1 }, model: DEFAULT_MODELS[0] });
  assert.equal(calls[0].headers["x-goog-api-key"], "k");
  assert.ok(!calls[0].url.includes("key="));
  const config = calls[0].body.generationConfig;
  assert.equal(config.responseMimeType, "application/json");
  assert.deepEqual(config.responseJsonSchema, { type: "object" });
  assert.deepEqual(config.thinkingConfig, { thinkingLevel: "low" });
  assert.equal(calls[0].body.systemInstruction.parts[0].text, "sys");
});

test("GEMINI_MODEL이 먼저, 2.5 모델은 thinkingBudget 0", async () => {
  assert.deepEqual(modelChain({ GEMINI_MODEL: "models/gemini-2.5-flash, gemini-3.8-flash" }).slice(0, 2), ["gemini-2.5-flash", "gemini-3.8-flash"]);
  const { calls, fetchImpl } = recorder(() => geminiResponse({}));
  await generateJson({ env: { AI_API: "k", GEMINI_MODEL: "gemini-2.5-flash" }, ...base, fetchImpl });
  assert.equal(calls[0].model, "gemini-2.5-flash");
  assert.deepEqual(calls[0].body.generationConfig.thinkingConfig, { thinkingBudget: 0 });
});

test("모델 없음(404)·한도(429)·장애(503)면 다음 모델로 넘어간다", async () => {
  const statuses = [404, 429, 503];
  const { calls, fetchImpl } = recorder(({ index }) =>
    index < statuses.length ? jsonResponse({ error: { code: statuses[index], message: "x" } }, statuses[index]) : geminiResponse({ n: index }),
  );
  const result = await generateJson({ env: { AI_API: "k" }, ...base, fetchImpl });
  assert.equal(result.model, DEFAULT_MODELS[3]);
  assert.deepEqual(calls.map((c) => c.model), DEFAULT_MODELS.slice(0, 4));

  // 실패했던 모델은 잠시 건너뛴다
  const second = recorder(() => geminiResponse({}));
  await generateJson({ env: { AI_API: "k" }, ...base, fetchImpl: second.fetchImpl });
  assert.equal(second.calls[0].model, DEFAULT_MODELS[3]);
});

test("400이면 스키마·생각 설정을 빼고 같은 모델로 다시 시도한다", async () => {
  const { calls, fetchImpl } = recorder(({ index }) =>
    index === 0 ? jsonResponse({ error: { code: 400, message: "Invalid JSON payload", status: "INVALID_ARGUMENT" } }, 400) : geminiResponse({ ok: true }),
  );
  const result = await generateJson({ env: { AI_API: "k" }, ...base, fetchImpl });
  assert.equal(result.model, DEFAULT_MODELS[0]);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.generationConfig.thinkingConfig, undefined);
  assert.equal(calls[1].body.generationConfig.responseJsonSchema, undefined);
});

test("잘못된 키·지역 제한은 바로 알려준다(다른 모델 시도 안 함)", async () => {
  const invalid = recorder(() =>
    jsonResponse({ error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT", details: [{ reason: "API_KEY_INVALID" }] } }, 400),
  );
  await assert.rejects(generateJson({ env: { AI_API: "bad" }, ...base, fetchImpl: invalid.fetchImpl }), (err) => err.code === "ai_key_invalid");
  assert.equal(invalid.calls.length, 1);

  const location = recorder(() =>
    jsonResponse({ error: { code: 400, message: "User location is not supported for the API use.", status: "FAILED_PRECONDITION" } }, 400),
  );
  await assert.rejects(generateJson({ env: { AI_API: "k" }, ...base, fetchImpl: location.fetchImpl }), (err) => err.code === "ai_location");
  assert.equal(location.calls.length, 1);
});

test("모든 모델이 한도 초과면 429 안내", async () => {
  const { fetchImpl } = recorder(({ model }) =>
    model === "gemini-flash-latest" ? jsonResponse({ error: { code: 404 } }, 404) : jsonResponse({ error: { code: 429, message: "quota" } }, 429),
  );
  await assert.rejects(generateJson({ env: { AI_API: "k" }, ...base, fetchImpl }), (err) => err.code === "ai_quota" && err.status === 429);
});

test("안전 차단과 빈 응답 처리", async () => {
  const blocked = recorder(() => jsonResponse({ promptFeedback: { blockReason: "SAFETY" } }));
  await assert.rejects(generateJson({ env: { AI_API: "k" }, ...base, fetchImpl: blocked.fetchImpl }), (err) => err.code === "ai_blocked");

  _resetGeminiState();
  const empty = recorder(() => jsonResponse({ candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }] }));
  await assert.rejects(generateJson({ env: { AI_API: "k" }, ...base, fetchImpl: empty.fetchImpl }), (err) => err.code === "ai_empty");
  assert.equal(empty.calls.length, DEFAULT_MODELS.length);
});

test("생각(thought) 파트는 건너뛰고 코드블록 JSON도 읽는다", async () => {
  const { fetchImpl } = recorder(() =>
    jsonResponse({
      candidates: [{ content: { parts: [{ text: "thinking...", thought: true }, { text: '```json\n{"a":1}\n```' }] } }],
    }),
  );
  const { data } = await generateJson({ env: { AI_API: "k" }, ...base, fetchImpl });
  assert.deepEqual(data, { a: 1 });
  assert.deepEqual(parseJsonLoose('설명 {"b":[1,2]} 끝'), { b: [1, 2] });
  assert.throws(() => parseJsonLoose("nope"));
});
