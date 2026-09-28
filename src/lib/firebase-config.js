// FIREBASE_CONFIG 환경변수 해석
//  - JSON: {"apiKey":"…","authDomain":"…","databaseURL":"…","projectId":"…",…}
//  - Firebase 콘솔 코드 그대로: const firebaseConfig = { apiKey: "…", … };

const KEYS = [
  "apiKey",
  "authDomain",
  "databaseURL",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
  "measurementId",
];

function tryJson(text) {
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

// 콘솔 코드처럼 따옴표 없는 키, 작은따옴표, 끝의 쉼표가 섞인 객체에서 필요한 키만 뽑습니다.
function parseLoose(text) {
  const out = {};
  for (const key of KEYS) {
    const m = new RegExp(`["']?\\b${key}["']?\\s*:\\s*(["'\`])(.*?)\\1`).exec(text);
    if (m) out[key] = m[2];
  }
  return Object.keys(out).length ? out : null;
}

function toObject(raw) {
  if (raw && typeof raw === "object") return raw;
  const text = String(raw ?? "").trim();
  if (!text) return null;
  let direct = null;
  try {
    direct = JSON.parse(text);
  } catch {
    // JSON 이 아니면 아래에서 객체 부분만 다시 해석
  }
  if (typeof direct === "string") direct = tryJson(direct); // JSON 을 한 번 더 문자열로 감싼 경우
  if (direct && typeof direct === "object") return direct;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const body = text.slice(start, end + 1);
  return tryJson(body) ?? parseLoose(body);
}

function cleanUrl(value) {
  const url = String(value ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\/[^\s/]+$/i.test(url) ? url : "";
}

/**
 * env.FIREBASE_CONFIG(+ FIREBASE_DATABASE_URL)를 브라우저용 설정으로 바꿉니다.
 * @returns {{ config: object|null, error: string|null }}
 */
export function parseFirebaseConfig(env = {}) {
  let obj = toObject(env.FIREBASE_CONFIG);
  if (obj && !obj.apiKey && obj.firebaseConfig && typeof obj.firebaseConfig === "object") {
    obj = obj.firebaseConfig;
  }
  if (!String(env.FIREBASE_CONFIG ?? "").trim() && !obj) {
    return { config: null, error: "FIREBASE_CONFIG 환경변수가 없습니다." };
  }
  if (!obj) return { config: null, error: "FIREBASE_CONFIG 값을 해석할 수 없습니다. firebaseConfig 객체를 그대로 넣어 주세요." };

  const config = {};
  for (const key of KEYS) {
    if (typeof obj[key] === "string" && obj[key].trim()) config[key] = obj[key].trim();
  }
  if (!config.apiKey || !config.projectId) {
    return { config: null, error: "FIREBASE_CONFIG 에 apiKey 와 projectId 가 있어야 합니다." };
  }
  config.authDomain ||= `${config.projectId}.firebaseapp.com`;
  const databaseURL = cleanUrl(env.FIREBASE_DATABASE_URL) || cleanUrl(config.databaseURL);
  if (databaseURL) config.databaseURL = databaseURL;
  else delete config.databaseURL;
  return { config, error: null };
}

const resolved = new Map();

/**
 * Realtime Database 주소를 정합니다.
 * FIREBASE_CONFIG 에 databaseURL 이 없으면 기본 주소(…firebaseio.com)에 물어봐서
 * 다른 지역(예: asia-southeast1)에 있다는 안내가 오면 그 주소를 씁니다.
 */
export async function resolveDatabaseURL(config, { fetchImpl = fetch } = {}) {
  if (config.databaseURL) return config.databaseURL;
  const fallback = `https://${config.projectId}-default-rtdb.firebaseio.com`;
  if (resolved.has(config.projectId)) return resolved.get(config.projectId);
  try {
    const res = await fetchImpl(`${fallback}/.json?shallow=true`, { signal: AbortSignal.timeout(5000) });
    const text = (await res.text()).slice(0, 2000);
    const regional = /https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.firebasedatabase\.app/i.exec(text)?.[0];
    const url = regional || fallback;
    resolved.set(config.projectId, url);
    return url;
  } catch {
    return fallback; // 네트워크 오류는 저장하지 않고 다음 요청에서 다시 확인
  }
}

/** 에뮬레이터 주소 (로컬 개발용). 운영에서는 비워 둡니다. */
export function emulatorHosts(env = {}) {
  const auth = String(env.FIREBASE_AUTH_EMULATOR_HOST ?? "").trim();
  const database = String(env.FIREBASE_DATABASE_EMULATOR_HOST ?? "").trim();
  return auth || database ? { auth: auth || null, database: database || null } : null;
}
