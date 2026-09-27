// GET /api/config — 브라우저가 Firebase를 초기화할 때 쓰는 설정(FIREBASE_CONFIG)
// Firebase 웹 설정(apiKey, databaseURL 등)은 원래 공개용 값이라 브라우저에 내려줘도 됩니다.
// 데이터 보호는 Realtime Database 보안 규칙(database.rules.json)이 담당합니다.

import { json } from "../lib/http.js";
import { firebaseClientConfig, readEmulators } from "../lib/firebase-config.js";

export function handleConfig(request, env) {
  const { config, error } = firebaseClientConfig(env);
  if (!config) {
    return json({ error, code: "firebase_config_missing" }, 500);
  }
  const emulators = readEmulators(env);
  const body = emulators ? { firebase: config, emulators } : { firebase: config };
  return json(body, 200, { "cache-control": emulators ? "no-store" : "private, max-age=300" });
}
