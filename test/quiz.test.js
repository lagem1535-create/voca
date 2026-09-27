import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shuffle,
  wordsInScope,
  selectWords,
  canBuildChoice,
  buildChoiceQuestions,
  gradeBlank,
  isNearMiss,
  blankFromExamples,
  letterHint,
  letterCount,
  scoreSummary,
  parseCount,
} from "../public/js/core/quiz.js";
import { splitWordList } from "../public/js/shared/text.js";

// 재현 가능한 난수
function seeded(seed = 42) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

const day = (n) => new Date(2026, 8, n);
const words = [
  { id: "1", word: "apple", meaning: "사과", language: "en", correct: 3, wrong: 0, createdAt: day(1), examples: [{ sentence: "I ate an apple.", translation: "나는 사과를 먹었다." }] },
  { id: "2", word: "run", meaning: "달리다", language: "en", correct: 1, wrong: 3, createdAt: day(2), examples: [{ sentence: "Dogs like to run.", translation: "개는 달리기를 좋아한다." }] },
  { id: "3", word: "book", meaning: "책", language: "en", correct: 0, wrong: 0, createdAt: day(3), examples: [] },
  { id: "4", word: "happy", meaning: "행복한", language: "en", correct: 2, wrong: 1, createdAt: day(4), examples: [] },
  { id: "5", word: "river", meaning: "강", language: "en", correct: 0, wrong: 0, createdAt: day(5), examples: [] },
  { id: "6", word: "猫", meaning: "고양이", language: "ja", correct: 0, wrong: 2, createdAt: day(6), examples: [] },
];

test("shuffle은 원본을 바꾸지 않고 같은 원소를 유지한다", () => {
  const list = [1, 2, 3, 4, 5];
  const out = shuffle(list, seeded());
  assert.deepEqual(list, [1, 2, 3, 4, 5]);
  assert.deepEqual([...out].sort(), [1, 2, 3, 4, 5]);
});

test("범위별 단어 고르기", () => {
  assert.deepEqual(wordsInScope(words, "recent").map((w) => w.id), ["6", "5", "4", "3", "2", "1"]);
  assert.deepEqual(wordsInScope(words, "wrong").map((w) => w.id), ["6", "2", "4"]);
  assert.deepEqual(wordsInScope(words, "new").map((w) => w.id).sort(), ["3", "5"]);
  assert.equal(wordsInScope(words, "all").length, 6);
});

test("selectWords는 개수를 제한하고 recent는 최신 단어만 고른다", () => {
  const picked = selectWords(words, { scope: "recent", count: "2" }, seeded());
  assert.deepEqual(picked.map((w) => w.id).sort(), ["5", "6"]);
  assert.equal(selectWords(words, { scope: "all", count: "all" }, seeded()).length, 6);
  assert.equal(selectWords(words, { scope: "all", count: "all", max: 4 }, seeded()).length, 4);
  assert.equal(parseCount("abc"), 10);
  assert.equal(parseCount("all"), Infinity);
});

test("5지선다: 정답 1개 + 서로 다른 오답 4개, 같은 언어 우선", () => {
  assert.equal(canBuildChoice(words), true);
  assert.equal(canBuildChoice(words.slice(0, 4)), false);
  const questions = buildChoiceQuestions(words.slice(0, 2), words, { direction: "w2m" }, seeded());
  assert.equal(questions.length, 2);
  for (const question of questions) {
    assert.equal(question.options.length, 5);
    assert.equal(question.options[question.answerIndex].text, question.word.meaning);
    assert.equal(new Set(question.options.map((o) => o.text)).size, 5);
    assert.ok(!question.options.some((o) => o.text === "고양이"), "영어 단어 문제에는 영어 단어 뜻이 먼저 보기로 나온다");
  }
  const reverse = buildChoiceQuestions([words[0]], words, { direction: "m2w" }, seeded());
  assert.equal(reverse[0].prompt, "사과");
  assert.equal(reverse[0].options[reverse[0].answerIndex].text, "apple");
});

test("빈칸 채점: 활용형·원형 모두 정답, 대소문자·공백 무시", () => {
  const question = { word: "run", answer: "ran" };
  assert.equal(gradeBlank(" Ran ", question), true);
  assert.equal(gradeBlank("run", question), true);
  assert.equal(gradeBlank("runs", question), false);
  assert.equal(gradeBlank("", question), false);
  assert.equal(isNearMiss("appel", { word: "apple", answer: "apple" }), false);
  assert.equal(isNearMiss("aple", { word: "apple", answer: "apple" }), true);
});

test("저장된 예문으로 빈칸 문제 만들기", () => {
  const question = blankFromExamples(words[0], seeded());
  assert.deepEqual(
    { before: question.before, answer: question.answer, after: question.after, source: question.source },
    { before: "I ate an ", answer: "apple", after: ".", source: "saved" },
  );
  assert.equal(blankFromExamples(words[2]), null);
});

test("힌트와 점수", () => {
  assert.equal(letterHint("ran"), "r _ _");
  assert.equal(letterCount("look forward"), 11);
  assert.deepEqual(scoreSummary([{ correct: true }, { correct: false }, { correct: true }]), { total: 3, correct: 2, rate: 67 });
});

test("여러 단어 입력 나누기", () => {
  assert.deepEqual(splitWordList("apple\n run , Apple;look forward to\n\n"), ["apple", "run", "look forward to"]);
});
