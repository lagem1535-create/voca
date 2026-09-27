// FIREBASE_CONFIG 환경변수 해석
// JSON, Firebase 콘솔 코드(const firebaseConfig = {...};), JSON 타입 변수(객체) 모두 허용

const KEYS = ["apiKey", "authDomain", "databaseURL", "projectId", "storageBucket", "messagingSenderId", "appId", "measurementId"];

function tryJson(text) {
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

// 따옴표 없는 키·작은따옴표가 섞인 JS 객체 코드에서 "키: 문자열" 쌍만 추출
function parseLoose(text) {
  const out = {};
  const pair = /["']?([A-Za-z_$][\w$]*)["']?\s*:\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/g;
  for (const m of text.matchAll(pair)) out[m[1]] = m[2] ?? m[3] ?? m[4];
  return Object.keys(out).length ? out : null;
}

export function parseFirebaseConfig(raw) {
  let obj = null;
  if (raw && typeof raw === "object") obj = raw;
  else {
    const text = String(raw ?? "").trim();
    if (!text) return { config: null, error: "FIREBASE_CONFIG 환경변수가 없습니다." };
    obj = tryJson(text);
    if (!obj) {
      const body = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
      obj = body ? tryJson(body) ?? parseLoose(body) : null;
    }
  }
  if (obj && !obj.apiKey && typeof obj.firebaseConfig === "object") obj = obj.firebaseConfig;
  if (!obj) return { config: null, error: "FIREBASE_CONFIG 값을 해석할 수 없습니다." };

  const config = {};
  for (const key of KEYS) {
    if (typeof obj[key] === "string" && obj[key].trim()) config[key] = obj[key].trim();
  }
  if (!config.apiKey || !config.projectId) {
    return { config: null, error: "FIREBASE_CONFIG에 apiKey와 projectId가 필요합니다." };
  }
  config.authDomain ||= `${config.projectId}.firebaseapp.com`;
  config.databaseURL ||= `https://${config.projectId}-default-rtdb.firebaseio.com`;
  config.databaseURL = config.databaseURL.replace(/\/+$/, "");
  return { config, error: null };
}
