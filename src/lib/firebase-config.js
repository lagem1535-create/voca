// FIREBASE_CONFIG 환경변수를 해석합니다.
// 다음 형식을 모두 받아들입니다.
//   1) JSON: {"apiKey":"...","authDomain":"...",...}
//   2) Firebase 콘솔 코드 그대로: const firebaseConfig = { apiKey: "...", ... };
//   3) 대시보드에서 JSON 타입 변수로 넣어 객체로 들어온 경우

const KEYS = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
  "measurementId",
  "databaseURL",
];

function tryJson(text) {
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

// 따옴표가 없는 키, 작은따옴표, 끝의 쉼표·세미콜론이 섞인 JS 객체 코드에서 "키: 문자열" 쌍만 뽑습니다.
function parseLoose(text) {
  const out = {};
  const pair = /["']?([A-Za-z_$][\w$]*)["']?\s*:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`([^`]*)`)/g;
  let match;
  while ((match = pair.exec(text))) {
    out[match[1]] = match[2] ?? match[3] ?? match[4];
  }
  return Object.keys(out).length ? out : null;
}

function toObject(raw) {
  if (raw && typeof raw === "object") return raw;
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const direct = tryJson(text);
  if (direct) return direct;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  const body = text.slice(start, end + 1);
  return tryJson(body) ?? parseLoose(body);
}

/**
 * @returns {{ config: Record<string,string> | null, error: string | null }}
 */
export function parseFirebaseConfig(raw) {
  if (raw == null || (typeof raw === "string" && !raw.trim())) {
    return {
      config: null,
      error: "FIREBASE_CONFIG 환경변수가 없습니다. Cloudflare 대시보드 → Workers → voca → 설정 → 변수 및 비밀에 추가하세요.",
    };
  }
  let obj = toObject(raw);
  if (obj && !obj.apiKey) {
    const nested = obj.firebaseConfig ?? obj.firebase ?? obj.config;
    if (nested && typeof nested === "object") obj = nested;
  }
  if (!obj) {
    return { config: null, error: "FIREBASE_CONFIG 값을 해석할 수 없습니다. Firebase 콘솔의 firebaseConfig 객체(JSON)를 그대로 넣어 주세요." };
  }
  const config = {};
  for (const key of KEYS) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) config[key] = value.trim();
  }
  if (!config.apiKey || !config.projectId) {
    return { config: null, error: "FIREBASE_CONFIG에 apiKey와 projectId가 모두 있어야 합니다." };
  }
  if (!config.authDomain) config.authDomain = `${config.projectId}.firebaseapp.com`;
  return { config, error: null };
}

/** 에뮬레이터용 환경변수(로컬 개발 전용)를 브라우저가 쓸 수 있는 형태로 바꿉니다. */
export function readEmulators(env) {
  const auth = String(env.FIREBASE_AUTH_EMULATOR_HOST ?? "").trim();
  const firestore = String(env.FIRESTORE_EMULATOR_HOST ?? "").trim();
  if (!auth && !firestore) return null;
  const out = {};
  if (auth) out.auth = auth.startsWith("http") ? auth : `http://${auth}`;
  if (firestore) out.firestore = firestore.replace(/^https?:\/\//, "");
  return out;
}
