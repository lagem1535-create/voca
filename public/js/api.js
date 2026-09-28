// Worker AI API 호출 — Firebase 로그인 토큰을 함께 보냅니다. (Gemini 키 AI_API 는 서버에만 있음)
import { auth } from "./firebase.js";

async function post(path, body, retried = false) {
  const user = auth().currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  const token = await user.getIdToken(retried);
  let res;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("서버에 연결하지 못했습니다. 인터넷 연결을 확인하세요.");
  }
  if (res.status === 401 && !retried) return post(path, body, true); // 토큰을 새로 받아 한 번 더
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `요청에 실패했습니다. (${res.status})`), { status: res.status });
  return data;
}

/** AI 뜻·예문: words → { items: [{ input, word, lang, meaning, pos, pronunciation, examples }], missing } */
export const aiWord = (words) => post("/api/ai/word", { words });

/** AI 빈칸 문제: [{ id, word, meaning, pos }] → { items: [{ id, sentence, answer, translation }], missing } */
export const aiBlank = (items) => post("/api/ai/blank", { items });
