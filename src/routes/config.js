// GET /api/config — 브라우저용 Firebase 설정 (FIREBASE_CONFIG)
import { HttpError, json } from "../lib/http.js";
import { emulatorHosts, parseFirebaseConfig, resolveDatabaseURL } from "../lib/firebase-config.js";

export async function handleConfig(request, env) {
  const { config, error } = parseFirebaseConfig(env);
  if (!config) throw new HttpError(503, error);
  const emulators = emulatorHosts(env);
  const databaseURL = emulators?.database
    ? config.databaseURL || `https://${config.projectId}-default-rtdb.firebaseio.com`
    : await resolveDatabaseURL(config);
  return json({ firebase: { ...config, databaseURL }, emulators });
}
