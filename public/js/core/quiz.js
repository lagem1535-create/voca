// 시험 문제를 만들고 채점하는 순수 함수들 (DOM·Firebase 의존성 없음 → Node 테스트 가능)

import { makeBlank, normalizeAnswer } from "../shared/text.js";

export const OPTION_COUNT = 5;
export const MAX_BLANK_QUESTIONS = 30;

export const SCOPES = [
  { value: "all", label: "전체 단어" },
  { value: "recent", label: "최근 추가" },
  { value: "wrong", label: "자주 틀린 단어" },
  { value: "new", label: "아직 안 푼 단어" },
];

export const COUNTS = [
  { value: "5", label: "5문제" },
  { value: "10", label: "10문제" },
  { value: "20", label: "20문제" },
  { value: "all", label: "전부" },
];

export const DIRECTIONS = [
  { value: "w2m", label: "단어 → 뜻" },
  { value: "m2w", label: "뜻 → 단어" },
  { value: "mix", label: "섞어서" },
];

export function shuffle(list, random = Math.random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const timeOf = (date) => (date instanceof Date ? date.getTime() : 0);
const attempts = (word) => (word.correct || 0) + (word.wrong || 0);
const wrongRate = (word) => (word.wrong || 0) / Math.max(1, attempts(word));

/** 범위에 해당하는 단어 (최근 추가·자주 틀린 순은 우선순위 순서로) */
export function wordsInScope(words, scope) {
  switch (scope) {
    case "recent":
      return [...words].sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt));
    case "wrong":
      return words
        .filter((word) => (word.wrong || 0) > 0)
        .sort((a, b) => wrongRate(b) - wrongRate(a) || (b.wrong || 0) - (a.wrong || 0));
    case "new":
      return words.filter((word) => attempts(word) === 0);
    default:
      return [...words];
  }
}

export function parseCount(value, fallback = 10) {
  if (value === "all") return Infinity;
  const count = Number.parseInt(value, 10);
  return Number.isFinite(count) && count > 0 ? count : fallback;
}

/** 시험에 낼 단어를 고릅니다. (문제 순서는 무작위) */
export function selectWords(words, { scope = "all", count = "10", max = Infinity } = {}, random = Math.random) {
  const pool = wordsInScope(words, scope);
  const size = Math.min(parseCount(count), pool.length, max);
  const ordered = scope === "recent" || scope === "wrong" ? pool : shuffle(pool, random);
  return shuffle(ordered.slice(0, size), random);
}

/** 5지선다를 만들 수 있는지: 서로 다른 단어·뜻이 5개 이상 필요 */
export function canBuildChoice(words, optionCount = OPTION_COUNT) {
  const meanings = new Set(words.map((word) => normalizeAnswer(word.meaning)).filter(Boolean));
  const texts = new Set(words.map((word) => normalizeAnswer(word.word)).filter(Boolean));
  return Math.min(meanings.size, texts.size) >= optionCount;
}

/**
 * 5지선다 문제 만들기
 * direction: "w2m"(단어 보고 뜻 고르기) | "m2w"(뜻 보고 단어 고르기) | "mix"
 */
export function buildChoiceQuestions(targets, allWords, { direction = "w2m", optionCount = OPTION_COUNT } = {}, random = Math.random) {
  const questions = [];
  for (const target of targets) {
    const mode = direction === "mix" ? (random() < 0.5 ? "w2m" : "m2w") : direction === "m2w" ? "m2w" : "w2m";
    const field = mode === "w2m" ? "meaning" : "word";
    const answerText = String(target[field] ?? "").trim();
    if (!answerText) continue;

    const seen = new Set([normalizeAnswer(answerText)]);
    const sameLanguage = (word) => Number((word.language || "") === (target.language || ""));
    // 무작위로 섞은 뒤 같은 언어의 단어를 앞으로 (정렬은 안정적이라 무작위 순서 유지)
    const others = shuffle(allWords.filter((word) => word.id !== target.id), random).sort((a, b) => sameLanguage(b) - sameLanguage(a));
    const distractors = [];
    for (const other of others) {
      const text = String(other[field] ?? "").trim();
      const key = normalizeAnswer(text);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      distractors.push({ id: other.id, text });
      if (distractors.length === optionCount - 1) break;
    }
    if (distractors.length < optionCount - 1) continue;

    const options = shuffle([{ id: target.id, text: answerText }, ...distractors], random);
    questions.push({
      word: target,
      mode,
      prompt: mode === "w2m" ? target.word : target.meaning,
      options,
      answerIndex: options.findIndex((option) => option.id === target.id),
    });
  }
  return questions;
}

/** 빈칸 답 채점: 문장 속 형태(활용형)나 원래 단어 둘 다 정답 */
export function gradeBlank(input, question) {
  const given = normalizeAnswer(input);
  if (!given) return false;
  return [question.answer, question.word].some((value) => normalizeAnswer(value) === given);
}

function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = temp;
    }
  }
  return row[b.length];
}

/** 한 글자만 틀렸는지 (오답이지만 "아깝다" 안내용) */
export function isNearMiss(input, question) {
  const given = normalizeAnswer(input);
  if (given.length < 3) return false;
  return [question.answer, question.word].some((value) => {
    const target = normalizeAnswer(value);
    return target && target !== given && editDistance(target, given) === 1;
  });
}

/** 저장된 예문으로 빈칸 문제 만들기 (AI 실패 시 대체용) */
export function blankFromExamples(word, random = Math.random) {
  for (const example of shuffle(word.examples || [], random)) {
    const blank = makeBlank(example?.sentence, [word.word]);
    if (blank) {
      return {
        id: word.id,
        word: word.word,
        ...blank,
        sentence: example.sentence,
        translation: example.translation || "",
        source: "saved",
      };
    }
  }
  return null;
}

/** 첫 글자 힌트: "ran" → "r _ _" */
export function letterHint(answer) {
  let revealed = false;
  return [...String(answer ?? "")]
    .map((ch) => {
      if (ch === " ") return " ";
      if (!/[\p{L}\p{N}]/u.test(ch)) return ch;
      if (revealed) return "_";
      revealed = true;
      return ch;
    })
    .join(" ");
}

export function letterCount(answer) {
  return [...String(answer ?? "")].filter((ch) => /[\p{L}\p{N}]/u.test(ch)).length;
}

export function scoreSummary(answers) {
  const total = answers.length;
  const correct = answers.filter((answer) => answer.correct).length;
  return { total, correct, rate: total ? Math.round((correct / total) * 100) : 0 };
}

export function cheerMessage(rate) {
  if (rate === 100) return "완벽해요! 모두 맞혔어요.";
  if (rate >= 80) return "훌륭해요! 조금만 더 하면 완벽해요.";
  if (rate >= 50) return "좋아요. 틀린 단어만 한 번 더 볼까요?";
  return "괜찮아요. 반복하면 금방 외워져요!";
}
