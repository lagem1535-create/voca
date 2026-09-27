// GET /api/health — 배포 후 환경변수가 제대로 들어갔는지 확인하는 용도 (비밀 값은 보여주지 않음)

import { json } from "../lib/http.js";
import { parseFirebaseConfig } from "../lib/firebase-config.js";
import { getApiKey, modelChain } from "../lib/gemini.js";

export function handleHealth(request, env) {
  const { config, error } = parseFirebaseConfig(env.FIREBASE_CONFIG);
  const aiKey = Boolean(getApiKey(env));
  return json({
    ok: Boolean(config) && aiKey,
    firebaseConfig: config ? { ok: true, projectId: config.projectId } : { ok: false, error },
    ai: { ok: aiKey, models: modelChain(env), restricted: Boolean(String(env.ALLOWED_EMAILS ?? "").trim()) },
  });
}
