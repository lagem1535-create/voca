// Worker AI API 호출 (Firebase 로그인 토큰을 함께 보냄)
import { currentUser } from "./firebase.js";

async function call(path, body) {
  const user = await currentUser();
  if (!user) throw new Error("로그인이 필요합니다.");
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${await user.getIdToken()}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
  return data.items || [];
}

/** 단어 목록 → AI 뜻·품사·발음·예문 */
export const aiWords = (words) => call("/api/ai/word", { words });

/** [{ id, word, meaning }] → AI 빈칸 문제 [{ id, sentence, answer, translation }] */
export const aiBlanks = (items) => call("/api/ai/blank", { items });
