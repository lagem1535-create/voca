// Firebase 로그인 토큰(ID 토큰) 검증
// 브라우저가 보낸 "Authorization: Bearer <ID 토큰>"을 Google 공개키로 확인해서
// 로그인한 사용자만 Gemini(AI_API)를 쓸 수 있게 합니다.

import { HttpError } from "./http.js";

const JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const CLOCK_SKEW_SECONDS = 300;
const EXPIRY_LEEWAY_SECONDS = 60;
const MIN_REFETCH_MS = 60_000;

let keyCache = { keys: new Map(), expiresAt: 0, fetchedAt: 0 };
let pendingRefresh = null;

export function _resetKeyCache() {
  keyCache = { keys: new Map(), expiresAt: 0, fetchedAt: 0 };
  pendingRefresh = null;
}

function base64UrlToBytes(input) {
  let text = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = text.length % 4;
  if (pad) text += "=".repeat(4 - pad);
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeSegment(segment) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment)));
}

async function refreshKeys(fetchImpl) {
  const res = await fetchImpl(JWKS_URL);
  if (!res.ok) throw new Error(`공개키를 가져오지 못했습니다 (HTTP ${res.status})`);
  const { keys = [] } = await res.json();
  const map = new Map();
  for (const jwk of keys) {
    if (!jwk?.kid || jwk.kty !== "RSA") continue;
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    map.set(jwk.kid, key);
  }
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") || "")?.[1] || 3600);
  const now = Date.now();
  keyCache = { keys: map, expiresAt: now + Math.min(maxAge, 6 * 3600) * 1000, fetchedAt: now };
}

async function getPublicKey(kid, fetchImpl) {
  const now = Date.now();
  const fresh = now < keyCache.expiresAt;
  if (fresh && keyCache.keys.has(kid)) return keyCache.keys.get(kid);
  // 키가 만료됐거나(주기적 교체) 처음 보는 kid면 다시 받아옵니다. 단, 너무 자주 받지 않도록 제한합니다.
  if (!fresh || now - keyCache.fetchedAt > MIN_REFETCH_MS) {
    pendingRefresh ??= refreshKeys(fetchImpl).finally(() => {
      pendingRefresh = null;
    });
    await pendingRefresh;
  }
  const key = keyCache.keys.get(kid);
  if (!key) throw new Error("알 수 없는 서명 키입니다.");
  return key;
}

/**
 * Firebase ID 토큰을 검증하고 토큰 내용(claims)을 돌려줍니다.
 * @param {string} token
 * @param {string} projectId Firebase 프로젝트 ID (토큰의 aud와 같아야 함)
 * @param {{ emulator?: boolean, now?: number, fetchImpl?: typeof fetch }} [options]
 */
export async function verifyFirebaseIdToken(token, projectId, options = {}) {
  const { emulator = false, now = Date.now(), fetchImpl = fetch } = options;
  if (!projectId) throw new Error("projectId가 없습니다.");
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("토큰 형식이 올바르지 않습니다.");

  const header = decodeSegment(parts[0]);
  const payload = decodeSegment(parts[1]);

  // Auth 에뮬레이터 토큰은 서명이 없습니다(로컬 개발 전용).
  if (!emulator) {
    if (header.alg !== "RS256" || !header.kid) throw new Error("지원하지 않는 토큰 서명 방식입니다.");
    const key = await getPublicKey(header.kid, fetchImpl);
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      base64UrlToBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!valid) throw new Error("토큰 서명이 올바르지 않습니다.");
  }

  const nowSeconds = Math.floor(now / 1000);
  if (payload.aud !== projectId) throw new Error("다른 Firebase 프로젝트의 토큰입니다.");
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error("토큰 발급자가 올바르지 않습니다.");
  if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 128) {
    throw new Error("토큰에 사용자 정보가 없습니다.");
  }
  if (typeof payload.exp !== "number" || payload.exp + EXPIRY_LEEWAY_SECONDS < nowSeconds) {
    throw new Error("토큰이 만료되었습니다.");
  }
  if (typeof payload.iat !== "number" || payload.iat - CLOCK_SKEW_SECONDS > nowSeconds) {
    throw new Error("토큰 발급 시각이 올바르지 않습니다.");
  }
  return { ...payload, uid: payload.sub };
}

function parseList(value) {
  return String(value ?? "")
    .split(/[,\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * 요청의 Authorization 헤더를 확인해 로그인 사용자를 돌려줍니다. 실패하면 401/403 HttpError.
 */
export async function requireUser(request, env, firebaseConfig) {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) throw new HttpError(401, "unauthenticated", "로그인이 필요합니다.");

  let claims;
  try {
    claims = await verifyFirebaseIdToken(match[1], firebaseConfig.projectId, {
      emulator: Boolean(env.FIREBASE_AUTH_EMULATOR_HOST),
    });
  } catch (err) {
    throw new HttpError(401, "invalid_token", "로그인 정보가 만료되었거나 올바르지 않습니다. 다시 로그인해 주세요.", {
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  const allowed = parseList(env.ALLOWED_EMAILS);
  if (allowed.length && !allowed.includes(String(claims.email || "").toLowerCase())) {
    throw new HttpError(403, "not_allowed", "이 계정은 AI 기능을 사용할 수 없습니다. (ALLOWED_EMAILS 설정 확인)");
  }
  return claims;
}
