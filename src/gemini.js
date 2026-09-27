// Gemini generateContent 호출 (키: env.AI_API)
// 모델은 GEMINI_MODEL(쉼표로 여러 개) → 기본 모델 순서로 시도하고, 없거나 한도 초과면 다음 모델로 넘어갑니다.

export const DEFAULT_MODELS = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-flash-lite-latest"];

export class AiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function modelChain(env) {
  const custom = String(env.GEMINI_MODEL ?? "")
    .split(",")
    .map((s) => s.trim().replace(/^models\//, ""))
    .filter(Boolean);
  return [...new Set([...custom, ...DEFAULT_MODELS])];
}

/** prompt와 JSON 스키마를 받아 파싱된 JSON 객체를 돌려줍니다. */
export async function generateJson(env, prompt, schema, { fetchImpl = fetch } = {}) {
  const key = String(env.AI_API ?? "").trim();
  if (!key) throw new AiError(503, "AI_API 환경변수(Gemini API 키)가 없습니다.");

  let lastError = new AiError(502, "AI 응답을 받지 못했습니다.");
  for (const model of modelChain(env)) {
    const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.7 },
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg = String(body?.error?.message || res.statusText);
      if (res.status === 400 && /api key/i.test(msg)) throw new AiError(502, "AI_API 키가 올바르지 않습니다.");
      if (res.status === 403) throw new AiError(502, "AI_API 키에 Gemini 사용 권한이 없습니다.");
      lastError = new AiError(res.status === 429 ? 429 : 502, res.status === 429 ? "AI 사용량 한도를 넘었습니다. 잠시 후 다시 시도하세요." : `AI 오류: ${msg.slice(0, 200)}`);
      if (res.status === 404 || res.status === 429 || res.status >= 500) continue;
      throw lastError;
    }
    const data = await res.json();
    const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
    try {
      return JSON.parse(text);
    } catch {
      lastError = new AiError(502, "AI 응답을 해석하지 못했습니다.");
    }
  }
  throw lastError;
}
