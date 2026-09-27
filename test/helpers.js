// 테스트 공용 도우미: 가짜 Google 공개키/토큰, fetch 대체

export const PROJECT_ID = "demo-voca";
export const FIREBASE_CONFIG = JSON.stringify({
  apiKey: "test-api-key",
  authDomain: `${PROJECT_ID}.firebaseapp.com`,
  projectId: PROJECT_ID,
  appId: "1:1:web:1",
});

const b64url = (data) => Buffer.from(data).toString("base64url");

export async function createSigner(kid = "test-kid") {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = { ...(await crypto.subtle.exportKey("jwk", publicKey)), kid, alg: "RS256", use: "sig" };
  async function sign(overrides = {}, header = {}) {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: `https://securetoken.google.com/${PROJECT_ID}`,
      aud: PROJECT_ID,
      auth_time: now - 10,
      user_id: "user-1",
      sub: "user-1",
      iat: now - 10,
      exp: now + 3600,
      email: "me@example.com",
      ...overrides,
    };
    const h = b64url(JSON.stringify({ alg: "RS256", kid, typ: "JWT", ...header }));
    const p = b64url(JSON.stringify(payload));
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`${h}.${p}`));
    return `${h}.${p}.${b64url(new Uint8Array(signature))}`;
  }
  return { jwk, sign };
}

export function unsignedToken(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    aud: PROJECT_ID,
    sub: "emu-user",
    iat: now,
    exp: now + 3600,
    ...overrides,
  };
  return `${b64url(JSON.stringify({ alg: "none", typ: "JWT" }))}.${b64url(JSON.stringify(payload))}.`;
}

export function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

/** Gemini generateContent 성공 응답 모양 */
export function geminiResponse(data) {
  return jsonResponse({
    candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(data) }] }, finishReason: "STOP" }],
  });
}

/**
 * globalThis.fetch를 바꿔 끼웁니다. handler(url, init) 가 Response를 돌려주면 됩니다.
 * 호출 기록(calls)과 원래대로 돌리는 restore()를 돌려줍니다.
 */
export function mockFetch(handler) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, init, body });
    return handler(url, init, body);
  };
  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}
