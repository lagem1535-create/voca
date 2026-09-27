// Firebase ID 토큰(JWT, RS256) 검증 — Google 공개키(JWK)로 서명 확인

const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
let keyCache = { keys: null, until: 0 };

function b64urlDecode(part) {
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const decodeJson = (part) => JSON.parse(new TextDecoder().decode(b64urlDecode(part)));

async function getKeys(fetchImpl) {
  if (keyCache.keys && Date.now() < keyCache.until) return keyCache.keys;
  const res = await fetchImpl(JWKS_URL);
  if (!res.ok) throw new Error("Google 공개키를 가져오지 못했습니다.");
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") || "")?.[1] || 3600);
  const { keys } = await res.json();
  keyCache = { keys, until: Date.now() + maxAge * 1000 };
  return keys;
}

export function _resetKeyCache() {
  keyCache = { keys: null, until: 0 };
}

/** 검증에 성공하면 토큰 내용(payload)을, 실패하면 null을 돌려줍니다. */
export async function verifyIdToken(token, projectId, { fetchImpl = fetch, now = Date.now() } = {}) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  let header, payload;
  try {
    header = decodeJson(parts[0]);
    payload = decodeJson(parts[1]);
  } catch {
    return null;
  }
  const sec = Math.floor(now / 1000);
  if (header.alg !== "RS256" || !header.kid) return null;
  if (payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (!payload.sub || payload.exp < sec || payload.iat > sec + 300) return null;

  const jwk = (await getKeys(fetchImpl)).find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64urlDecode(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  return ok ? payload : null;
}
