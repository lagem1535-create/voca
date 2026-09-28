// Realtime Database 저장소 — 로그인한 사용자별로 users/{uid}/voca 아래에 저장합니다.
//
//   users/{uid}/voca/words/{id}    word, meaning, pos, pronunciation, lang, examples[{sentence, translation}], memo,
//                                  starred, correct, wrong, streak, lastResult, lastTestedAt, createdAt, updatedAt
//   users/{uid}/voca/results/{id}  type(choice|blank), scope, dir, total, correct, wrong[단어], createdAt
import {
  auth,
  db,
  ref,
  onValue,
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
import { clean } from "./shared/text.js";

const CONNECT_TIMEOUT = 15000;

let uid = null;
let stopWords = null;
let connectTimer = null;
let state = { status: "idle", words: [], error: null };
const subscribers = new Set();

const path = (sub = "") => `users/${uid}/voca${sub}`;

function emit() {
  for (const cb of [...subscribers]) cb(state);
}

/** Realtime Database 오류를 알아보기 쉬운 메시지로 바꿉니다. */
export function dbError(err) {
  const text = `${err?.code || ""} ${err?.message || err}`;
  if (/permission.?denied/i.test(text)) {
    const e = new Error("Realtime Database 규칙 때문에 단어장을 읽거나 쓸 수 없어요.");
    e.kind = "rules";
    return e;
  }
  return err instanceof Error ? err : new Error(String(err));
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const toArray = (v) => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : []);

function toWord(id, w) {
  return {
    id,
    word: w.word,
    meaning: w.meaning || "",
    pos: w.pos || "",
    pronunciation: w.pronunciation || "",
    lang: w.lang || "en",
    examples: toArray(w.examples)
      .filter((e) => e && e.sentence)
      .map((e) => ({ sentence: e.sentence, translation: e.translation || "" })),
    memo: w.memo || "",
    starred: Boolean(w.starred),
    correct: num(w.correct),
    wrong: num(w.wrong),
    streak: num(w.streak),
    lastResult: w.lastResult || null,
    lastTestedAt: num(w.lastTestedAt) || null,
    createdAt: num(w.createdAt),
    updatedAt: num(w.updatedAt),
  };
}

/** 로그인 사용자가 바뀌면 단어 실시간 구독을 새로 시작합니다. */
export function setUser(user) {
  const next = user?.uid ?? null;
  if (next === uid) return;
  stopWords?.();
  stopWords = null;
  clearTimeout(connectTimer);
  uid = next;
  state = { status: uid ? "loading" : "idle", words: [], error: null };
  if (uid) {
    // 연결이 끝나지 않으면(주소가 틀렸거나 네트워크 문제) 무한 로딩 대신 안내합니다. 늦게라도 받으면 그대로 표시.
    connectTimer = setTimeout(() => {
      if (state.status !== "loading") return;
      state = {
        status: "error",
        words: [],
        error: new Error("Realtime Database 에 연결하지 못했어요. 인터넷 연결과 FIREBASE_CONFIG 의 databaseURL 을 확인하세요."),
      };
      emit();
    }, CONNECT_TIMEOUT);
    stopWords = onValue(
      ref(db(), path("/words")),
      (snap) => {
        clearTimeout(connectTimer);
        const val = snap.val() || {};
        const words = Object.entries(val)
          .filter(([, w]) => w && typeof w.word === "string" && w.word)
          .map(([id, w]) => toWord(id, w));
        state = { status: "ready", words, error: null };
        emit();
      },
      (err) => {
        if (!auth().currentUser) return; // 로그아웃하면서 취소된 구독
        clearTimeout(connectTimer);
        state = { status: "error", words: [], error: dbError(err) };
        emit();
      },
    );
  }
  emit();
}

/** 단어 목록이 바뀔 때마다 cb(state) — signal 이 abort 되면 구독 해제 */
export function watchWords(cb, signal) {
  subscribers.add(cb);
  signal?.addEventListener("abort", () => subscribers.delete(cb), { once: true });
  if (state.status === "ready" || state.status === "error") cb(state);
}

/** 단어 목록을 한 번 받습니다 (처음 불러오는 중이면 기다림). */
export function loadWords() {
  return new Promise((resolve, reject) => {
    const cb = (s) => {
      if (s.status === "ready") resolve(s.words);
      else if (s.status === "error") reject(s.error);
      else return;
      subscribers.delete(cb);
    };
    subscribers.add(cb);
    cb(state);
  });
}

function wordData(d) {
  return {
    word: clean(d.word, 80),
    meaning: clean(d.meaning, 200),
    pos: clean(d.pos, 30),
    pronunciation: clean(d.pronunciation, 80),
    lang: clean(d.lang, 20) || "en",
    examples: toArray(d.examples)
      .map((e) => ({ sentence: clean(e?.sentence, 300), translation: clean(e?.translation, 300) }))
      .filter((e) => e.sentence)
      .slice(0, 5),
    memo: String(d.memo ?? "").trim().slice(0, 500),
  };
}

function newWord(d) {
  return {
    ...wordData(d),
    starred: false,
    correct: 0,
    wrong: 0,
    streak: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

async function write(promise) {
  try {
    return await promise;
  } catch (err) {
    throw dbError(err);
  }
}

export async function addWord(data) {
  const r = push(ref(db(), path("/words")));
  await write(set(r, newWord(data)));
  return r.key;
}

/** 여러 단어를 한 번에(원자적으로) 저장합니다. */
export async function addWords(list) {
  const base = ref(db(), path("/words"));
  const updates = {};
  for (const d of list) updates[push(base).key] = newWord(d);
  await write(update(base, updates));
}

export function updateWord(id, data) {
  return write(update(ref(db(), path(`/words/${id}`)), { ...wordData(data), updatedAt: serverTimestamp() }));
}

export function deleteWord(id) {
  return write(remove(ref(db(), path(`/words/${id}`))));
}

export function setStar(id, starred) {
  return write(update(ref(db(), path(`/words/${id}`)), { starred: Boolean(starred) }));
}

/** 시험 한 문제의 결과를 단어 기록에 반영합니다. */
export function recordAnswer(id, correct) {
  const now = serverTimestamp();
  const changes = correct
    ? { correct: increment(1), streak: increment(1), lastResult: "correct", lastTestedAt: now }
    : { wrong: increment(1), streak: 0, lastResult: "wrong", lastTestedAt: now };
  return write(update(ref(db(), path(`/words/${id}`)), changes));
}

export function saveResult({ type, scope, dir, total, correct, wrong = [] }) {
  return write(
    push(ref(db(), path("/results")), {
      type,
      scope,
      dir: dir || null,
      total,
      correct,
      wrong: wrong.slice(0, 50).map((w) => w.word),
      createdAt: serverTimestamp(),
    }),
  );
}

/** 최근 시험 기록 limit 개 (최신순) */
export function watchResults(limit, cb, signal) {
  const q = query(ref(db(), path("/results")), orderByKey(), limitToLast(limit));
  const off = onValue(
    q,
    (snap) => {
      const list = [];
      snap.forEach((child) => {
        list.push({ id: child.key, ...child.val() });
      });
      cb(list.reverse(), null);
    },
    (err) => {
      if (auth().currentUser) cb([], dbError(err));
    },
  );
  signal?.addEventListener("abort", off, { once: true });
}
