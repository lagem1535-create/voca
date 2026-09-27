// Worker: /api/* 만 처리 (나머지 경로는 public/ 정적 파일)
//   GET  /api/config   브라우저용 Firebase 설정 (FIREBASE_CONFIG)
//   GET  /api/health   환경변수 설정 상태
//   POST /api/ai/word  AI 뜻·예문 생성   (로그인 필요)
//   POST /api/ai/blank AI 빈칸 문제 생성 (로그인 필요)
import { parseFirebaseConfig } from "./config.js";
import { verifyIdToken } from "./auth.js";
import { aiWords, aiBlanks } from "./ai.js";
import { AiError } from "./gemini.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

async function requireUser(request, env) {
  const { config, error } = parseFirebaseConfig(env.FIREBASE_CONFIG);
  if (!config) throw new AiError(503, error);
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const user = await verifyIdToken(token, config.projectId);
  if (!user) throw new AiError(401, "로그인이 필요합니다.");
  return user;
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    throw new AiError(400, "요청 형식이 올바르지 않습니다.");
  }
}

const routes = {
  "GET /api/config": (req, env) => {
    const { config, error } = parseFirebaseConfig(env.FIREBASE_CONFIG);
    return config ? json({ firebase: config }) : json({ error }, 503);
  },
  "GET /api/health": (req, env) => {
    const { config, error } = parseFirebaseConfig(env.FIREBASE_CONFIG);
    const ai = Boolean(String(env.AI_API ?? "").trim());
    return json({ ok: Boolean(config) && ai, firebaseConfig: config ? "ok" : error, ai: ai ? "ok" : "AI_API 환경변수가 없습니다." });
  },
  "POST /api/ai/word": async (req, env) => {
    await requireUser(req, env);
    const body = await readBody(req);
    const words = Array.isArray(body.words) ? body.words : [body.word];
    return json({ items: await aiWords(env, words) });
  },
  "POST /api/ai/blank": async (req, env) => {
    await requireUser(req, env);
    const body = await readBody(req);
    return json({ items: await aiBlanks(env, body.items) });
  },
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const handler = routes[`${request.method} ${url.pathname.replace(/\/+$/, "")}`];
    if (!handler) return json({ error: "없는 API입니다." }, 404);
    try {
      return await handler(request, env);
    } catch (err) {
      if (err instanceof AiError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: "서버 오류가 발생했습니다." }, 500);
    }
  },
};
