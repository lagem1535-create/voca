// 테스트 도우미: Firebase ID 토큰 서명용 RSA 키, 가짜 fetch
import { webcrypto } from "node:crypto";

const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");

export async function makeSigner(kid = "test-kid") {
  const { publicKey, privateKey } = await webcrypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = { ...(await webcrypto.subtle.exportKey("jwk", publicKey)), kid, alg: "RS256", use: "sig" };
  async function sign(payload, header = {}) {
    const head = enc({ alg: "RS256", kid, typ: "JWT", ...header });
    const body = enc(payload);
    const sig = await webcrypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`${head}.${body}`));
    return `${head}.${body}.${Buffer.from(sig).toString("base64url")}`;
  }
  return { jwk, sign };
}

export function claims(projectId, overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: `https://securetoken.google.com/${projectId}`,
    aud: projectId,
    sub: "user-1",
    user_id: "user-1",
    email: "me@example.com",
    email_verified: true,
    iat: now - 10,
    auth_time: now - 10,
    exp: now + 3600,
    ...overrides,
  };
}

export function unsignedToken(payload) {
  return `${enc({ alg: "none", typ: "JWT" })}.${enc(payload)}.`;
}

export const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

export function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });
}

/** Gemini generateContent 응답 모양 */
export function geminiResponse(obj, extra = {}) {
  return jsonResponse({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] }, finishReason: "STOP", ...extra }] });
}
