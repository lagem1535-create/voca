// Firebase 로그인 토큰(ID 토큰) 검증 — Google 공개키(JWK) + WebCrypto
// https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library

const JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const CLOCK_SKEW = 300; // 초

let keyCache = { keys: null, until: 0 };

function b64urlBytes(part) {
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function b64urlJson(part) {
  return JSON.parse(new TextDecoder().decode(b64urlBytes(part)));
}

async function publicKeys(fetchImpl, force) {
  if (!force && keyCache.keys && Date.now() < keyCache.until) return keyCache.keys;
  const res = await fetchImpl(JWKS_URL);
  if (!res.ok) throw new Error(`Google 공개키를 가져오지 못했습니다 (${res.status})`);
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") || "")?.[1] || 3600);
  const { keys } = await res.json();
  keyCache = { keys: Array.isArray(keys) ? keys : [], until: Date.now() + maxAge * 1000 };
  return keyCache.keys;
}

/** 테스트용: 공개키 캐시 비우기 */
export function clearKeyCache() {
  keyCache = { keys: null, until: 0 };
}

/**
 * 토큰이 올바르면 payload(uid 는 payload.sub), 아니면 null 을 돌려줍니다.
 * emulator: true 이면 Auth 에뮬레이터의 서명 없는 토큰도 받습니다(로컬 개발 전용).
 */
export async function verifyIdToken(token, projectId, { fetchImpl = fetch, now = Date.now(), emulator = false } = {}) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || !projectId) return null;

  let header;
  let payload;
  try {
    header = b64urlJson(parts[0]);
    payload = b64urlJson(parts[1]);
  } catch {
    return null;
  }

  const sec = Math.floor(now / 1000);
  if (payload.aud !== projectId) return null;
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 128) return null;
  if (!(payload.exp > sec)) return null;
  if (typeof payload.iat === "number" && payload.iat > sec + CLOCK_SKEW) return null;
  if (typeof payload.auth_time === "number" && payload.auth_time > sec + CLOCK_SKEW) return null;

  if (emulator && header.alg === "none") return payload;
  if (header.alg !== "RS256" || !header.kid) return null;

  let jwk = (await publicKeys(fetchImpl, false)).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await publicKeys(fetchImpl, true)).find((k) => k.kid === header.kid); // 키 교체 직후
  if (!jwk) return null;

  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64urlBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  return ok ? payload : null;
}
