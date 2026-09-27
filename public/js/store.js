// Realtime Database 저장소: users/{uid}/voca/{words,results}
import { firebase, currentUser, ref, get, set, update, push, remove } from "./firebase.js";

async function base(path = "") {
  const { db } = await firebase();
  const user = await currentUser();
  if (!user) throw new Error("로그인이 필요합니다.");
  return ref(db, `users/${user.uid}/voca${path}`);
}

function friendly(err) {
  if (/permission.denied/i.test(String(err?.code || err?.message))) {
    return new Error("Realtime Database 규칙 때문에 거부되었습니다. users/$uid/voca 읽기·쓰기를 허용하세요.");
  }
  return err;
}

const wrap = (fn) => async (...args) => {
  try {
    return await fn(...args);
  } catch (err) {
    throw friendly(err);
  }
};

/** 모든 단어 [{ id, ...}] (최근 추가 순) */
export const listWords = wrap(async () => {
  const snap = await get(await base("/words"));
  const val = snap.val() || {};
  return Object.entries(val)
    .map(([id, w]) => ({ id, ...w, examples: w.examples || [] }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
});

export const getWord = wrap(async (id) => {
  const snap = await get(await base(`/words/${id}`));
  return snap.exists() ? { id, ...snap.val(), examples: snap.val().examples || [] } : null;
});

function pick(w) {
  return {
    word: String(w.word || "").trim(),
    meaning: String(w.meaning || "").trim(),
    partOfSpeech: String(w.partOfSpeech || "").trim(),
    pronunciation: String(w.pronunciation || "").trim(),
    examples: (w.examples || []).filter((e) => e && e.sentence).map((e) => ({ sentence: e.sentence, translation: e.translation || "" })),
    memo: String(w.memo || "").trim(),
  };
}

export const addWord = wrap(async (w) => {
  const node = push(await base("/words"));
  await set(node, { ...pick(w), correct: 0, wrong: 0, createdAt: Date.now(), updatedAt: Date.now() });
  return node.key;
});

export const saveWord = wrap(async (id, w) => {
  await update(await base(`/words/${id}`), { ...pick(w), updatedAt: Date.now() });
});

export const deleteWord = wrap(async (id) => {
  await remove(await base(`/words/${id}`));
});

/** 시험 결과 저장: answers = [{ id, ok }] */
export const saveResult = wrap(async (type, answers, words) => {
  const now = Date.now();
  const byId = new Map(words.map((w) => [w.id, w]));
  const changes = {};
  for (const { id, ok } of answers) {
    const w = byId.get(id);
    if (!w) continue;
    changes[`words/${id}/${ok ? "correct" : "wrong"}`] = (w[ok ? "correct" : "wrong"] || 0) + 1;
    changes[`words/${id}/lastTestedAt`] = now;
  }
  const resultKey = push(await base("/results")).key;
  changes[`results/${resultKey}`] = {
    type,
    total: answers.length,
    correct: answers.filter((a) => a.ok).length,
    createdAt: now,
  };
  await update(await base(), changes);
});

export const listResults = wrap(async () => {
  const snap = await get(await base("/results"));
  return Object.values(snap.val() || {}).sort((a, b) => b.createdAt - a.createdAt);
});
