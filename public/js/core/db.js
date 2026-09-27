// Realtime Database 저장소 (Firebase 콘솔의 Realtime Database)
//   users/{uid}/voca/words/{단어ID}    단어·뜻·예문·시험 통계
//   users/{uid}/voca/results/{기록ID}  시험 결과
// 규칙: users/{uid}/voca 는 로그인한 본인만 읽고 쓸 수 있어야 합니다. (database.rules.json)

import {
  getFirebase,
  ref,
  get,
  set,
  update,
  push,
  remove,
  query,
  orderByKey,
  limitToLast,
  serverTimestamp,
  increment,
} from "./firebase.js";
import { cleanText } from "../shared/text.js";

const MAX_EXAMPLES = 5;

async function database() {
  return (await getFirebase()).db;
}

const basePath = (uid) => `users/${uid}/voca`;
const wordsPath = (uid) => `${basePath(uid)}/words`;

function toDate(value) {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value) : null;
}

// Realtime Database는 배열을 {0: …, 1: …} 객체로 돌려줄 수 있어서 둘 다 받습니다.
function toList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value && typeof value === "object" ? Object.values(value).filter(Boolean) : [];
}

const timeOf = (date) => (date instanceof Date ? date.getTime() : 0);

function fromWord(id, data) {
  return {
    id,
    word: data.word ?? "",
    meaning: data.meaning ?? "",
    partOfSpeech: data.partOfSpeech ?? "",
    pronunciation: data.pronunciation ?? "",
    language: data.language ?? "",
    examples: toList(data.examples).map((example) => ({
      sentence: example.sentence ?? "",
      translation: example.translation ?? "",
    })),
    memo: data.memo ?? "",
    correct: Number(data.correct) || 0,
    wrong: Number(data.wrong) || 0,
    lastTestedAt: toDate(data.lastTestedAt),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

/** 저장 전에 입력값을 정리합니다. */
export function sanitizeWord(input) {
  const word = cleanText(input.word, 100);
  return {
    word,
    wordLower: word.toLowerCase(),
    meaning: cleanText(input.meaning, 300),
    partOfSpeech: cleanText(input.partOfSpeech, 60),
    pronunciation: cleanText(input.pronunciation, 80),
    language: cleanText(input.language, 20).toLowerCase(),
    examples: toList(input.examples)
      .map((example) => ({
        sentence: cleanText(example?.sentence, 300),
        translation: cleanText(example?.translation, 300),
      }))
      .filter((example) => example.sentence)
      .slice(0, MAX_EXAMPLES),
    memo: String(input.memo ?? "").trim().slice(0, 1000),
  };
}

function assertWord(data) {
  if (!data.word) throw new Error("단어를 입력해 주세요.");
  if (!data.meaning) throw new Error("뜻을 입력해 주세요.");
}

function newWordRecord(data) {
  return { ...data, correct: 0, wrong: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
}

/** 모든 단어 (최근 추가 순) */
export async function listWords(uid) {
  const snap = await get(ref(await database(), wordsPath(uid)));
  const value = snap.val() || {};
  return Object.entries(value)
    .filter(([, data]) => data && typeof data.word === "string" && data.word)
    .map(([id, data]) => fromWord(id, data))
    .sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt) || (a.id < b.id ? 1 : -1));
}

export async function getWord(uid, id) {
  const snap = await get(ref(await database(), `${wordsPath(uid)}/${id}`));
  const data = snap.val();
  return data && typeof data.word === "string" && data.word ? fromWord(id, data) : null;
}

/** 이미 저장된 단어를 찾습니다. (대소문자 무시) → Map<소문자 단어, 단어> */
export async function findWordsByText(uid, texts) {
  const wanted = new Set(texts.map((text) => cleanText(text, 100).toLowerCase()).filter(Boolean));
  const found = new Map();
  if (!wanted.size) return found;
  for (const word of await listWords(uid)) {
    const key = word.word.toLowerCase();
    if (wanted.has(key) && !found.has(key)) found.set(key, word);
  }
  return found;
}

export async function addWord(uid, input) {
  const data = sanitizeWord(input);
  assertWord(data);
  const newRef = push(ref(await database(), wordsPath(uid)));
  await set(newRef, newWordRecord(data));
  return newRef.key;
}

/** 여러 단어를 한 번에(원자적으로) 저장합니다. */
export async function addWords(uid, inputs) {
  const items = inputs.map(sanitizeWord);
  items.forEach(assertWord);
  const listRef = ref(await database(), wordsPath(uid));
  const updates = {};
  for (const data of items) updates[push(listRef).key] = newWordRecord(data);
  await update(listRef, updates);
  return items.length;
}

export async function updateWord(uid, id, input) {
  const data = sanitizeWord(input);
  assertWord(data);
  await update(ref(await database(), `${wordsPath(uid)}/${id}`), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteWord(uid, id) {
  await remove(ref(await database(), `${wordsPath(uid)}/${id}`));
}

/**
 * 시험 결과를 저장하고 단어별 정답/오답 횟수를 올립니다. (한 번에 원자적으로)
 * @param {{ type: string, total: number, correct: number, [key: string]: any }} result
 * @param {{ id: string, correct: boolean }[]} answers
 */
export async function saveTestResult(uid, result, answers) {
  const db = await database();
  const resultKey = push(ref(db, `${basePath(uid)}/results`)).key;
  const updates = { [`results/${resultKey}`]: { ...result, createdAt: serverTimestamp() } };
  for (const answer of answers) {
    if (!answer.id) continue;
    updates[`words/${answer.id}/${answer.correct ? "correct" : "wrong"}`] = increment(1);
    updates[`words/${answer.id}/lastTestedAt`] = serverTimestamp();
  }
  await update(ref(db, basePath(uid)), updates);
}

/** 최근 시험 기록 (최신 순). 기록 ID(push 키)가 시간 순이라 키 순서로 가져옵니다. */
export async function listResults(uid, max = 10) {
  const snap = await get(query(ref(await database(), `${basePath(uid)}/results`), orderByKey(), limitToLast(max)));
  const results = [];
  snap.forEach((child) => {
    const data = child.val() || {};
    results.push({ ...data, id: child.key, createdAt: toDate(data.createdAt) });
  });
  return results.reverse();
}

export function dbErrorMessage(err) {
  const message = String(err?.message || err || "");
  if (/permission[_ ]denied/i.test(message)) {
    return "Realtime Database 규칙 때문에 거부되었습니다. Firebase 콘솔 → Realtime Database → 규칙에서 users/$uid/voca 읽기·쓰기를 본인에게 허용해 주세요. (README의 규칙 참고)";
  }
  if (/different region|database url|databaseurl/i.test(message)) {
    return "FIREBASE_CONFIG의 databaseURL이 실제 Realtime Database 주소와 다릅니다. Firebase 콘솔 → Realtime Database 화면의 주소로 바꿔 주세요.";
  }
  if (/offline|network|timeout/i.test(message)) {
    return "Realtime Database에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.";
  }
  return message || "데이터를 처리하는 중 오류가 발생했습니다.";
}
