// GET /api/health — 환경변수 설정 상태 (비밀 값은 보여주지 않습니다)
import { json, listVar } from "../lib/http.js";
import { parseFirebaseConfig, resolveDatabaseURL } from "../lib/firebase-config.js";
import { modelList } from "../lib/gemini.js";

export async function handleHealth(request, env) {
  const { config, error } = parseFirebaseConfig(env);
  const ai = Boolean(String(env.AI_API ?? "").trim());
  return json({
    ok: Boolean(config) && ai,
    firebaseConfig: config ? "ok" : error,
    projectId: config?.projectId ?? null,
    databaseURL: config ? await resolveDatabaseURL(config) : null,
    ai: ai ? "ok" : "AI_API 환경변수가 없습니다.",
    models: modelList(env),
    aiAccess: listVar(env.ALLOWED_EMAILS).length ? "ALLOWED_EMAILS 에 있는 계정만" : "로그인한 모든 사용자",
  });
}
