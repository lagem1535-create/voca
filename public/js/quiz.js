// 시험 로직 (DOM 없음 — test/quiz.test.js 에서 검사)
import { makeBlank, normalizeAnswer } from "./shared/text.js";

export const OPTION_COUNT = 5;
export const MAX_BLANK_QUESTIONS = 30; // AI 빈칸은 한 번에 30문제까지 (서버 제한과 같음)

export const tested = (w) => (w.correct || 0) + (w.wrong || 0) > 0;
/** 틀린 적이 있고 그 뒤로 두 번 연속 맞히지 못한 단어 */
export const needsReview = (w) => (w.wrong || 0) > 0 && (w.streak || 0) < 2;
/** 세 번 이상 연속으로 맞힌 단어 */
export const mastered = (w) => (w.streak || 0) >= 3;

export const byRecent = (a, b) => (b.createdAt || 0) - (a.createdAt || 0) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

export const SCOPES = {
  all: { label: "전체", filter: (list) => list },
  review: { label: "복습 필요", filter: (list) => list.filter(needsReview) },
  new: { label: "안 본 단어", filter: (list) => list.filter((w) => !tested(w)) },
  recent: { label: "최근 추가 30개", filter: (list) => [...list].sort(byRecent).slice(0, 30) },
  starred: { label: "별표", filter: (list) => list.filter((w) => w.starred) },
};

export const DIRECTIONS = {
  w2m: "단어 → 뜻",
  m2w: "뜻 → 단어",
  mix: "섞어서",
};

export const COUNTS = [5, 10, 20, 30, 0]; // 0 = 전체

export function shuffle(list, rand = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function wordsInScope(words, scope) {
  return (SCOPES[scope] ?? SCOPES.all).filter(words);
}

/** 범위에 맞는 단어를 섞어서 count 개(0 이면 전부) 고릅니다. */
export function pickTargets(words, { scope = "all", count = 10 } = {}, rand = Math.random) {
  const list = shuffle(wordsInScope(words, scope), rand);
  return count > 0 ? list.slice(0, count) : list;
}

/** URL 의 ?scope=&count=&dir= 를 읽습니다. */
export function readTestSettings(params) {
  const scope = SCOPES[params.get("scope")] ? params.get("scope") : "all";
  const n = Number.parseInt(params.get("count") ?? "10", 10);
  const count = Number.isFinite(n) && n >= 0 ? Math.min(n, 500) : 10;
  const dir = DIRECTIONS[params.get("dir")] ? params.get("dir") : "w2m";
  return { scope, count, dir };
}

function distinct(words, field) {
  return new Set(words.map((w) => normalizeAnswer(w[field])).filter(Boolean)).size;
}

/** 5지선다를 만들려면 뜻과 단어가 서로 다른 단어가 5개 이상 있어야 합니다. */
export function canBuildChoice(pool) {
  return distinct(pool, "meaning") >= OPTION_COUNT && distinct(pool, "word") >= OPTION_COUNT;
}

/**
 * 5지선다 문제 만들기
 * @param targets 문제로 낼 단어
 * @param pool    오답 보기를 고를 전체 단어
 * @param dir     "w2m"(단어→뜻) | "m2w"(뜻→단어) | "mix"
 * @returns [{ word, mode, prompt, options: [{id, text}], answer(정답 번호) }]
 */
export function buildChoiceQuestions(targets, pool, dir = "w2m", rand = Math.random) {
  const questions = [];
  for (const word of targets) {
    const mode = dir === "mix" ? (rand() < 0.5 ? "w2m" : "m2w") : dir;
    const field = mode === "w2m" ? "meaning" : "word";
    const used = new Set([normalizeAnswer(word[field])]);
    // 품사가 같은 단어를 먼저 오답 보기로 써서 헷갈리게 만듭니다.
    const candidates = shuffle(pool.filter((w) => w.id !== word.id), rand).sort(
      (a, b) => Number(Boolean(word.pos) && b.pos === word.pos) - Number(Boolean(word.pos) && a.pos === word.pos),
    );
    const distractors = [];
    for (const c of candidates) {
      const key = normalizeAnswer(c[field]);
      if (!key || used.has(key)) continue;
      used.add(key);
      distractors.push(c);
      if (distractors.length === OPTION_COUNT - 1) break;
    }
    if (distractors.length < OPTION_COUNT - 1) continue;
    const options = shuffle([word, ...distractors], rand).map((w) => ({ id: w.id, text: w[field] }));
    questions.push({
      word,
      mode,
      prompt: mode === "w2m" ? word.word : word.meaning,
      options,
      answer: options.findIndex((o) => o.id === word.id),
    });
  }
  return questions;
}

/**
 * AI 문제가 없을 때 쓰는 빈칸 문제: 저장된 예문에서 단어를 찾아 빈칸으로,
 * 그것도 안 되면 뜻을 보고 단어를 쓰는 문제로 만듭니다.
 */
export function fallbackBlank(word) {
  for (const ex of word.examples || []) {
    const blank = makeBlank(ex.sentence, "", word.word);
    if (blank) return { sentence: blank.sentence, answer: blank.answer, translation: ex.translation || "", source: "example" };
  }
  return { sentence: null, answer: word.word, translation: "", source: "meaning" };
}

/** 홈 화면 요약 */
export function summarize(words) {
  let correct = 0;
  let wrong = 0;
  for (const w of words) {
    correct += w.correct || 0;
    wrong += w.wrong || 0;
  }
  return {
    total: words.length,
    review: words.filter(needsReview).length,
    mastered: words.filter(mastered).length,
    fresh: words.filter((w) => !tested(w)).length,
    accuracy: correct + wrong ? correct / (correct + wrong) : null,
  };
}
