// Worker의 AI API 호출 (Firebase 로그인 토큰을 함께 보냄)

import { getIdToken } from "./auth.js";

export class ApiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

async function post(path, body, retried = false) {
  const token = await getIdToken(retried);
  let res;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.", "network", 0);
  }
  const data = await res.json().catch(() => null);
  if (res.status === 401 && !retried) return post(path, body, true); // 토큰을 새로 받아 한 번 더
  if (!res.ok) {
    throw new ApiError(data?.error || `요청에 실패했습니다. (HTTP ${res.status})`, data?.code || "http_error", res.status);
  }
  return data;
}

/** 단어 목록(최대 20개)의 뜻·품사·발음·예문을 AI로 생성 */
export function generateWordInfo(words, exampleCount = 2) {
  return post("/api/ai/word", { words, exampleCount });
}

/** [{ id, word, meaning }] (최대 20개)로 AI 빈칸 문제 생성 */
export function generateBlankQuestions(items) {
  return post("/api/ai/blank", { items });
}
