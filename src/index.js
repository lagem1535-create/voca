// voca Worker 진입점
// 정적 페이지(public/)는 Cloudflare가 바로 서비스하고, /api/* 만 이 Worker가 기능별 경로로 나눠 처리합니다.
//
//   GET  /api/config    Firebase 웹 설정 (FIREBASE_CONFIG)
//   GET  /api/health    환경변수 설정 상태 확인
//   POST /api/ai/word   AI 뜻·예문 생성      (로그인 필요, AI_API 사용)
//   POST /api/ai/blank  AI 빈칸 시험 문제 생성 (로그인 필요, AI_API 사용)

import { errorResponse, json } from "./lib/http.js";
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

export async function handleApi(request, env, ctx) {
  const { pathname } = new URL(request.url);
  const route = routes[pathname.replace(/\/+$/, "")];
  if (!route) return json({ error: "API 경로를 찾을 수 없습니다.", code: "not_found" }, 404);
  const handler = route[request.method];
  if (!handler) {
    return json({ error: "허용되지 않는 요청 방식입니다.", code: "method_not_allowed" }, 405, {
      allow: Object.keys(route).join(", "),
    });
  }
  try {
    return await handler(request, env, ctx);
  } catch (err) {
    return errorResponse(err);
  }
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return handleApi(request, env, ctx);
    }
    // 정적 파일에 없는 경로: 404 페이지를 돌려줍니다.
    return env.ASSETS.fetch(request);
  },
};
