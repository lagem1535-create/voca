// Worker 진입점 — /api/* 만 처리합니다. (그 밖의 경로는 public/ 정적 파일과 브라우저 라우터가 담당)
//
//   GET  /api/config    브라우저용 Firebase 설정 (FIREBASE_CONFIG)          src/routes/config.js
//   GET  /api/health    환경변수 설정 상태                                   src/routes/health.js
//   POST /api/ai/word   AI 뜻·예문 (로그인 필요, Gemini = AI_API)            src/routes/ai-word.js
//   POST /api/ai/blank  AI 빈칸 문제 (로그인 필요, Gemini = AI_API)          src/routes/ai-blank.js
import { HttpError, json } from "./lib/http.js";
import { handleConfig } from "./routes/config.js";
import { handleHealth } from "./routes/health.js";
import { handleAiWord } from "./routes/ai-word.js";
import { handleAiBlank } from "./routes/ai-blank.js";

const routes = {
  "/api/config": { GET: handleConfig },
  "/api/health": { GET: handleHealth },
  "/api/ai/word": { POST: handleAiWord },
  "/api/ai/blank": { POST: handleAiBlank },
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    const route = routes[url.pathname.replace(/\/+$/, "")];
    if (!route) return json({ error: "없는 API 입니다." }, 404);
    const handler = route[request.method];
    if (!handler) return json({ error: "허용되지 않는 요청 방식입니다." }, 405);

    try {
      return await handler(request, env, ctx);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: "서버 오류가 발생했습니다." }, 500);
    }
  },
};
