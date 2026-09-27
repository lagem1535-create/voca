// Firestore 저장소
//   users/{uid}/words/{단어ID}    단어·뜻·예문·시험 통계
//   users/{uid}/results/{기록ID}  시험 결과

import {
  getFirebase,
  collection,
  doc,
  getDoc,
  getDocs,
  getCount,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  increment,
  writeBatch,
} from "./firebase.js";
import { cleanText } from "../shared/text.js";

const IN_QUERY_LIMIT = 30;
const BATCH_LIMIT = 450;

async function db() {
  return (await getFirebase()).db;
}

const wordsCol = (database, uid) => collection(database, "users", uid, "words");
const resultsCol = (database, uid) => collection(database, "users", uid, "results");
const wordDoc = (database, uid, id) => doc(database, "users", uid, "words", id);

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  return value instanceof Date ? value : null;
}

function fromWordSnap(snap) {
  const data = snap.data() || {};
  return {
    id: snap.id,
    word: data.word ?? "",
    meaning: data.meaning ?? "",
    partOfSpeech: data.partOfSpeech ?? "",
    pronunciation: data.pronunciation ?? "",
    language: data.language ?? "",
    examples: Array.isArray(data.examples) ? data.examples : [],
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
    examples: (Array.isArray(input.examples) ? input.examples : [])
      .map((example) => ({
        sentence: cleanText(example?.sentence, 300),
        translation: cleanText(example?.translation, 300),
      }))
      .filter((example) => example.sentence)
      .slice(0, 5),
    memo: String(input.memo ?? "").trim().slice(0, 1000),
  };
}

function assertWord(data) {
  if (!data.word) throw new Error("단어를 입력해 주세요.");
  if (!data.meaning) throw new Error("뜻을 입력해 주세요.");
}

export async function listWords(uid) {
  const snap = await getDocs(query(wordsCol(await db(), uid), orderBy("createdAt", "desc")));
  return snap.docs.map(fromWordSnap);
}

export async function getWord(uid, id) {
  const snap = await getDoc(wordDoc(await db(), uid, id));
  return snap.exists() ? fromWordSnap(snap) : null;
}

/** 이미 저장된 단어를 찾습니다. (대소문자 무시) → Map<소문자 단어, 단어> */
export async function findWordsByText(uid, texts) {
  const database = await db();
  const lowers = [...new Set(texts.map((text) => cleanText(text, 100).toLowerCase()).filter(Boolean))];
  const found = new Map();
  for (let i = 0; i < lowers.length; i += IN_QUERY_LIMIT) {
    const chunk = lowers.slice(i, i + IN_QUERY_LIMIT);
    const snap = await getDocs(query(wordsCol(database, uid), where("wordLower", "in", chunk)));
    for (const item of snap.docs.map(fromWordSnap)) found.set(item.word.toLowerCase(), item);
  }
  return found;
}

export async function addWord(uid, input) {
  const data = sanitizeWord(input);
  assertWord(data);
  const ref = await addDoc(wordsCol(await db(), uid), {
    ...data,
    correct: 0,
    wrong: 0,
    lastTestedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** 여러 단어를 한 번에 저장합니다. */
export async function addWords(uid, inputs) {
  const database = await db();
  const items = inputs.map(sanitizeWord);
  items.forEach(assertWord);
  for (let i = 0; i < items.length; i += BATCH_LIMIT) {
    const batch = writeBatch(database);
    for (const data of items.slice(i, i + BATCH_LIMIT)) {
      batch.set(doc(wordsCol(database, uid)), {
        ...data,
        correct: 0,
        wrong: 0,
        lastTestedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }
  return items.length;
}

export async function updateWord(uid, id, input) {
  const data = sanitizeWord(input);
  assertWord(data);
  await updateDoc(wordDoc(await db(), uid, id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteWord(uid, id) {
  await deleteDoc(wordDoc(await db(), uid, id));
}

export async function countWords(uid) {
  const snap = await getCount(wordsCol(await db(), uid));
  return snap.data().count;
}

export async function countWeakWords(uid) {
  const snap = await getCount(query(wordsCol(await db(), uid), where("wrong", ">", 0)));
  return snap.data().count;
}

/** 많이 틀린 단어 */
export async function listWeakWords(uid, max = 5) {
  const snap = await getDocs(
    query(wordsCol(await db(), uid), where("wrong", ">", 0), orderBy("wrong", "desc"), limit(max)),
  );
  return snap.docs.map(fromWordSnap);
}

/**
 * 시험 결과를 저장하고 단어별 정답/오답 횟수를 올립니다.
 * @param {{ type: string, total: number, correct: number, [key: string]: any }} result
 * @param {{ id: string, correct: boolean }[]} answers
 */
export async function saveTestResult(uid, result, answers) {
  const database = await db();
  const resultRef = doc(resultsCol(database, uid));
  const record = { ...result, createdAt: serverTimestamp() };
  const batch = writeBatch(database);
  batch.set(resultRef, record);
  for (const answer of answers.slice(0, BATCH_LIMIT)) {
    if (!answer.id) continue;
    batch.update(wordDoc(database, uid, answer.id), {
      [answer.correct ? "correct" : "wrong"]: increment(1),
      lastTestedAt: serverTimestamp(),
    });
  }
  try {
    await batch.commit();
  } catch (err) {
    // 시험 도중 다른 곳에서 단어를 지운 경우: 결과만 저장
    if (err?.code !== "not-found") throw err;
    await setDoc(resultRef, record);
  }
}

export async function listResults(uid, max = 10) {
  const snap = await getDocs(query(resultsCol(await db(), uid), orderBy("createdAt", "desc"), limit(max)));
  return snap.docs.map((item) => {
    const data = item.data();
    return { id: item.id, ...data, createdAt: toDate(data.createdAt) };
  });
}

export function dbErrorMessage(err) {
  const message = String(err?.message || "");
  if (/database .*does not exist/i.test(message) || /has not been used|is disabled/i.test(message)) {
    return "Firestore 데이터베이스가 준비되지 않았습니다. Firebase 콘솔 → Firestore Database → 데이터베이스 만들기를 진행해 주세요.";
  }
  switch (err?.code) {
    case "permission-denied":
      return "Firestore 보안 규칙 때문에 거부되었습니다. Firebase 콘솔의 Firestore 규칙에 저장소의 firestore.rules 내용을 붙여넣어 주세요.";
    case "unauthenticated":
      return "로그인이 필요합니다. 다시 로그인해 주세요.";
    case "unavailable":
    case "deadline-exceeded":
      return "Firestore에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.";
    case "resource-exhausted":
      return "Firestore 사용량 한도를 넘었습니다. 잠시 후 다시 시도해 주세요.";
    case "failed-precondition":
      return "Firestore 설정(색인 또는 데이터베이스)이 준비되지 않았습니다.";
    case "not-found":
      return "데이터를 찾을 수 없습니다. 이미 삭제되었을 수 있어요.";
    default:
      return message || "데이터를 처리하는 중 오류가 발생했습니다.";
  }
}
