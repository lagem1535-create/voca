// AI API 는 로그인한 사용자만 — 브라우저가 보낸 Firebase ID 토큰을 확인합니다.
import { HttpError, listVar } from "./http.js";
import { parseFirebaseConfig } from "./firebase-config.js";
import { verifyIdToken } from "./verify-token.js";

export async function requireUser(request, env) {
  const { config, error } = parseFirebaseConfig(env);
  if (!config) throw new HttpError(503, error);

  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1];
  if (!token) throw new HttpError(401, "로그인이 필요합니다.");

  let user = null;
  try {
    user = await verifyIdToken(token, config.projectId, {
      emulator: Boolean(String(env.FIREBASE_AUTH_EMULATOR_HOST ?? "").trim()),
    });
  } catch (err) {
    console.error("token verify failed", err);
    throw new HttpError(503, "로그인 확인 서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.");
  }
  if (!user) throw new HttpError(401, "로그인이 만료되었습니다. 다시 로그인하세요.");

  const allowed = listVar(env.ALLOWED_EMAILS);
  if (allowed.length) {
    const email = String(user.email || "").toLowerCase();
    if (!email || user.email_verified !== true || !allowed.includes(email)) {
      throw new HttpError(403, "AI 기능을 사용할 수 없는 계정입니다. (ALLOWED_EMAILS 에 있는 인증된 이메일만 사용 가능)");
    }
  }
  return user;
}
