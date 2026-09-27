// Gemini API(generateContent) 호출
// - 키: env.AI_API (예전 이름 GEMINI_API_KEY도 허용)
// - 모델: env.GEMINI_MODEL(쉼표로 여러 개 가능) → 기본 모델 순서대로 시도
//   모델이 없어졌거나(404) 한도 초과(429)·일시 장애(5xx)면 다음 모델로 넘어갑니다.
// - 응답은 JSON 스키마로 받아 객체로 돌려줍니다.

import { HttpError } from "./http.js";

export const DEFAULT_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-flash-latest",
];

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com";
const REQUEST_TIMEOUT_MS = 45_000;

// 같은 Worker 인스턴스 안에서 실패한 모델을 잠시 건너뛰기 위한 기록
const cooldownUntil = new Map();
// 추가 설정(생각 수준·스키마)을 거부한 모델은 기본 설정으로만 호출
const plainOnlyModels = new Set();

export function _resetGeminiState() {
  cooldownUntil.clear();
  plainOnlyModels.clear();
}

export function getApiKey(env) {
  return String(env.AI_API ?? env.GEMINI_API_KEY ?? "").trim();
}

export function modelChain(env) {
  const custom = String(env.GEMINI_MODEL ?? "")
    .split(",")
    .map((name) => name.trim().replace(/^models\//, ""))
    .filter(Boolean);
  return [...new Set([...custom, ...DEFAULT_MODELS])];
}

function thinkingConfigFor(model) {
  if (/^gemini-2\.5-flash/.test(model)) return { thinkingBudget: 0 };
  if (/^gemini-2\.5-pro/.test(model)) return { thinkingBudget: 128 };
  if (/^gemini-([3-9]|\d{2,})/.test(model)) return { thinkingLevel: "low" };
  return null;
}

function buildGenerationConfig({ model, schema, maxOutputTokens, plain }) {
  const config = { responseMimeType: "application/json", maxOutputTokens };
  if (!plain) {
    if (schema) config.responseJsonSchema = schema;
    const thinking = thinkingConfigFor(model);
    if (thinking) config.thinkingConfig = thinking;
  }
  return config;
}

class GeminiError extends HttpError {
  constructor(status, code, message, { retryable = false, cooldownMs = 0, badRequest = false, detail } = {}) {
    super(status, code, message, detail ? { detail } : undefined);
    this.retryable = retryable;
    this.cooldownMs = cooldownMs;
    this.badRequest = badRequest;
  }
}

async function toGeminiError(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    // 본문이 JSON이 아닐 수 있음
  }
  const error = body?.error ?? {};
  const message = String(error.message || res.statusText || "");
  const reasons = (error.details || []).map((d) => d?.reason).filter(Boolean);
  const detail = message.slice(0, 300);

  if (reasons.includes("API_KEY_INVALID") || /api key not valid|api_key_invalid|api key expired/i.test(message)) {
    return new GeminiError(500, "ai_key_invalid", "AI_API(Gemini API 키)가 올바르지 않습니다. Cloudflare 변수 값을 확인해 주세요.", { detail });
  }
  if (/location is not supported/i.test(message)) {
    return new GeminiError(502, "ai_location", "Gemini API가 현재 서버 위치를 지원하지 않습니다. 잠시 후 다시 시도하거나 README의 문제 해결을 참고하세요.", { detail });
  }
  if (res.status === 404) {
    return new GeminiError(502, "ai_model_not_found", "요청한 Gemini 모델을 찾을 수 없습니다.", { retryable: true, cooldownMs: 3_600_000, detail });
  }
  if (res.status === 429) {
    return new GeminiError(429, "ai_quota", "Gemini 사용량 한도를 넘었습니다. 잠시 후 다시 시도해 주세요.", { retryable: true, cooldownMs: 30_000, detail });
  }
  if (res.status === 403) {
    return new GeminiError(500, "ai_forbidden", "Gemini API 사용 권한이 없습니다. API 키 제한 설정이나 Generative Language API 사용 설정을 확인해 주세요.", { detail });
  }
  if (res.status >= 500) {
    return new GeminiError(502, "ai_unavailable", "Gemini 서버가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해 주세요.", { retryable: true, cooldownMs: 10_000, detail });
  }
  return new GeminiError(502, "ai_bad_request", "Gemini 요청이 거부되었습니다.", { badRequest: res.status === 400, retryable: true, detail });
}

/** 모델 응답 텍스트에서 JSON을 꺼냅니다. (코드블록·앞뒤 설명이 섞여도 처리) */
export function parseJsonLoose(text) {
  const raw = String(text ?? "").trim();
  const attempts = [raw];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  if (fenced) attempts.push(fenced[1].trim());
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) attempts.push(raw.slice(start, end + 1));
  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch {
      // 다음 후보 시도
    }
  }
  throw new Error("JSON 파싱 실패");
}

function extractJson(body) {
  const candidate = body?.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const text = parts
    .filter((part) => typeof part?.text === "string" && !part.thought)
    .map((part) => part.text)
    .join("")
    .trim();
  const blockReason = body?.promptFeedback?.blockReason;
  const finishReason = candidate?.finishReason;
  if (blockReason || finishReason === "SAFETY" || finishReason === "PROHIBITED_CONTENT") {
    throw new GeminiError(422, "ai_blocked", "AI 안전 정책으로 답변이 차단되었습니다. 다른 단어로 시도해 주세요.", {
      detail: blockReason || finishReason,
    });
  }
  if (!text) {
    throw new GeminiError(502, "ai_empty", "AI가 빈 응답을 보냈습니다. 다시 시도해 주세요.", {
      retryable: true,
      detail: finishReason || "EMPTY",
    });
  }
  try {
    return parseJsonLoose(text);
  } catch {
    throw new GeminiError(502, "ai_bad_output", "AI 응답을 해석하지 못했습니다. 다시 시도해 주세요.", {
      retryable: true,
      detail: finishReason || "PARSE",
    });
  }
}

async function callModel({ baseUrl, apiKey, model, system, prompt, schema, maxOutputTokens, fetchImpl, timeoutMs }) {
  const variants = plainOnlyModels.has(model) ? [true] : [false, true];
  let lastError;
  for (const plain of variants) {
    let res;
    try {
      res = await fetchImpl(`${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: buildGenerationConfig({ model, schema, maxOutputTokens, plain }),
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
      throw new GeminiError(504, timedOut ? "ai_timeout" : "ai_network", timedOut ? "AI 응답이 너무 오래 걸립니다. 다시 시도해 주세요." : "AI 서버에 연결하지 못했습니다.", {
        retryable: true,
        detail: String(err?.message || err),
      });
    }
    if (res.ok) {
      return extractJson(await res.json());
    }
    lastError = await toGeminiError(res);
    // 400이면 추가 설정(스키마·생각 수준)을 빼고 한 번 더 시도합니다.
    if (lastError.badRequest && !plain) {
      plainOnlyModels.add(model);
      continue;
    }
    throw lastError;
  }
  throw lastError;
}

/**
 * Gemini에 JSON 응답을 요청합니다.
 * @returns {Promise<{ data: any, model: string }>}
 */
export async function generateJson({ env, system, prompt, schema, maxOutputTokens = 8192, fetchImpl = fetch, timeoutMs = REQUEST_TIMEOUT_MS }) {
  const apiKey = getApiKey(env);
  if (!apiKey) {
    throw new HttpError(500, "ai_key_missing", "AI_API 환경변수(Gemini API 키)가 설정되지 않았습니다. Cloudflare 대시보드 → Workers → voca → 설정 → 변수 및 비밀에 추가하세요.");
  }
  const baseUrl = String(env.GEMINI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const models = modelChain(env);
  const now = Date.now();
  let candidates = models.filter((model) => (cooldownUntil.get(model) ?? 0) <= now);
  if (!candidates.length) candidates = [models[0]];

  // 모든 모델이 실패하면 "모델 없음"보다 한도 초과·장애처럼 더 쓸모 있는 오류를 알려줍니다.
  let reportError;
  for (const model of candidates) {
    try {
      const data = await callModel({ baseUrl, apiKey, model, system, prompt, schema, maxOutputTokens, fetchImpl, timeoutMs });
      cooldownUntil.delete(model);
      return { data, model };
    } catch (err) {
      if (!(err instanceof GeminiError) || !err.retryable) throw err;
      if (err.cooldownMs) cooldownUntil.set(model, Date.now() + err.cooldownMs);
      if (!reportError || reportError.code === "ai_model_not_found") reportError = err;
      console.warn(`Gemini model ${model} failed: ${err.code} ${err.extra?.detail ?? ""}`);
    }
  }
  throw reportError;
}
