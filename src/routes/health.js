// GET /api/health — 배포 후 환경변수가 제대로 들어갔는지 확인하는 용도 (비밀 값은 보여주지 않음)

import { json } from "../lib/http.js";
import { firebaseClientConfig } from "../lib/firebase-config.js";
import { getApiKey, modelChain } from "../lib/gemini.js";

export function handleHealth(request, env) {
  const { config, error } = firebaseClientConfig(env);
  const aiKey = Boolean(getApiKey(env));
  const databaseURL = config?.databaseURL || "";
  return json({
    ok: Boolean(config) && Boolean(databaseURL) && aiKey,
    firebaseConfig: config ? { ok: true, projectId: config.projectId } : { ok: false, error },
    database: databaseURL
      ? { ok: true, url: databaseURL }
      : { ok: false, error: "Realtime Database 주소(databaseURL)가 없습니다. FIREBASE_CONFIG에 databaseURL을 넣거나 FIREBASE_DATABASE_URL 변수를 추가하세요." },
    ai: { ok: aiKey, models: modelChain(env), restricted: Boolean(String(env.ALLOWED_EMAILS ?? "").trim()) },
  });
}
