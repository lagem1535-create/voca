// Gemini API 호출 (키: AI_API) — JSON 스키마로 응답을 받습니다.
// 모델이 없거나(404) 한도 초과(429)·서버 오류면 다음 모델로 넘어갑니다.
import { HttpError } from "./http.js";

export const DEFAULT_MODELS = [
  "gemini-3.6-flash",
  "gemini-flash-latest",
  "gemini-3.5-flash-lite",
  "gemini-flash-lite-latest",
];
const DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta";

/** GEMINI_MODEL(쉼표 구분)을 앞에 두고 기본 모델을 뒤에 붙인 시도 순서 */
export function modelList(env = {}) {
  const custom = String(env.GEMINI_MODEL ?? "")
    .split(",")
    .map((s) => s.trim().replace(/^models\//, ""))
    .filter(Boolean);
  return [...new Set([...custom, ...DEFAULT_MODELS])];
}

// 생각(thinking)을 짧게 제한해 응답을 빠르게 합니다. lite 모델은 기본값(생각 안 함)을 씁니다.
function thinkingFor(model) {
  return /lite/i.test(model) ? null : { thinkingBudget: 1024 };
}

// 여러 모델에서 실패했을 때 사용자에게 보여줄 가장 의미 있는 오류를 고르기 위한 순위
const RANK = { 404: 1, 400: 2, 403: 3, 502: 4, 504: 4, 429: 5 };
const rank = (err) => RANK[err?.status] ?? 0;

async function errorDetail(res) {
  const text = await res.text().catch(() => "");
  try {
    return String(JSON.parse(text)?.error?.message || text);
  } catch {
    return text || res.statusText;
  }
}

function mapError(status, detail) {
  const d = detail.slice(0, 300);
  if (/api key not valid|api_key_invalid|api key expired/i.test(d)) {
    return { fatal: true, error: new HttpError(502, "AI_API 키가 올바르지 않습니다. Cloudflare 변수 AI_API 값을 확인하세요.") };
  }
  if (/location is not supported/i.test(d)) {
    return {
      fatal: true,
      error: new HttpError(502, "현재 서버 위치에서는 Gemini API 를 쓸 수 없습니다. (README 의 문제 해결 참고)"),
    };
  }
  if (status === 429) return { error: new HttpError(429, "AI 사용량 한도를 넘었습니다. 잠시 후 다시 시도하세요.") };
  if (status === 404) return { error: new HttpError(404, `Gemini 모델을 찾을 수 없습니다: ${d}`) };
  if (status === 401 || status === 403) {
    const msg = /referer|referrer/i.test(d)
      ? "AI_API 키에 웹사이트(리퍼러) 제한이 걸려 있어 서버에서 쓸 수 없습니다. 키 제한을 확인하세요."
      : `AI_API 키로 Gemini 를 쓸 권한이 없습니다: ${d}`;
    return { error: new HttpError(403, msg) };
  }
  if (status >= 500) return { error: new HttpError(502, "AI 서버에 일시적인 오류가 있습니다. 잠시 후 다시 시도하세요.") };
  return { error: new HttpError(400, `AI 요청 오류: ${d}`) };
}

/** 모델 출력 텍스트 → JSON (```json 코드블록도 허용) */
export function parseJsonText(text) {
  const t = String(text ?? "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(t.slice(start, end + 1));
      } catch {
        // 아래에서 undefined
      }
    }
    return undefined;
  }
}

function readCandidate(data) {
  const cand = data?.candidates?.[0];
  if (!cand) {
    if (data?.promptFeedback?.blockReason) {
      return { fatal: true, error: new HttpError(422, "AI 가 이 요청을 처리하지 않았습니다(안전 필터). 다른 단어로 시도하세요.") };
    }
    return { error: new HttpError(502, "AI 응답이 비어 있습니다.") };
  }
  const text = (cand.content?.parts || [])
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
  const value = parseJsonText(text);
  if (value && typeof value === "object") return { value };
  return {
    error: new HttpError(
      502,
      cand.finishReason === "MAX_TOKENS"
        ? "AI 응답이 너무 길어 잘렸습니다. 한 번에 보내는 단어 수를 줄여 보세요."
        : "AI 응답을 해석하지 못했습니다. 다시 시도하세요.",
    ),
  };
}

/**
 * 프롬프트를 보내고 JSON 객체를 돌려받습니다.
 * @param {object} env  Worker 환경변수 (AI_API, GEMINI_MODEL, GEMINI_BASE_URL)
 * @param {{prompt: string, schema: object, temperature?: number, maxOutputTokens?: number}} req  temperature 는 생략하면 모델 기본값
 */
export async function generateJson(env, req, { fetchImpl = fetch, timeoutMs = 45000, totalMs = 70000 } = {}) {
  const key = String(env.AI_API ?? "").trim();
  if (!key) throw new HttpError(503, "AI_API 환경변수(Gemini API 키)가 없습니다.");
  const base = String(env.GEMINI_BASE_URL ?? "").trim().replace(/\/+$/, "") || DEFAULT_BASE;
  const deadline = Date.now() + totalMs;

  let lastError = null;
  const keep = (err) => {
    if (!lastError || rank(err) >= rank(lastError)) lastError = err;
  };

  for (const model of modelList(env)) {
    if (lastError && Date.now() > deadline - 5000) break; // 너무 오래 걸리면 다음 모델은 건너뜀
    let thinking = thinkingFor(model);
    for (let attempt = 0; attempt < 2; attempt++) {
      const generationConfig = {
        maxOutputTokens: req.maxOutputTokens ?? 8192,
        responseMimeType: "application/json",
        responseSchema: req.schema,
      };
      // Gemini 3 는 기본 온도(1.0)를 권장하므로 따로 지정했을 때만 보냅니다.
      if (typeof req.temperature === "number") generationConfig.temperature = req.temperature;
      if (thinking) generationConfig.thinkingConfig = thinking;

      let res;
      try {
        res = await fetchImpl(`${base}/models/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: req.prompt }] }], generationConfig }),
          signal: AbortSignal.timeout(Math.max(5000, Math.min(timeoutMs, deadline - Date.now()))),
        });
      } catch (err) {
        keep(
          new HttpError(
            504,
            err?.name === "TimeoutError" ? "AI 응답이 너무 늦습니다. 잠시 후 다시 시도하세요." : "AI 서버에 연결하지 못했습니다.",
          ),
        );
        break;
      }

      if (res.ok) {
        const out = readCandidate(await res.json().catch(() => null));
        if (out.value) return out.value;
        if (out.fatal) throw out.error;
        keep(out.error);
        break;
      }

      const detail = await errorDetail(res);
      if (res.status === 400 && thinking && /thinking/i.test(detail)) {
        thinking = null; // 이 모델은 생각 설정을 받지 않음 → 같은 모델로 한 번 더
        continue;
      }
      const mapped = mapError(res.status, detail);
      if (mapped.fatal) throw mapped.error;
      console.warn(`gemini ${model} ${res.status}: ${detail.slice(0, 200)}`);
      keep(mapped.error);
      break;
    }
  }
  throw lastError ?? new HttpError(502, "AI 응답을 받지 못했습니다.");
}
