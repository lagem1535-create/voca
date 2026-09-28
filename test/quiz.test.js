import test from "node:test";
import assert from "node:assert/strict";
import {
  buildChoiceQuestions,
  canBuildChoice,
  pickTargets,
  wordsInScope,
  readTestSettings,
  fallbackBlank,
  summarize,
  needsReview,
  OPTION_COUNT,
} from "../public/js/quiz.js";

function seeded(seed = 1) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

const words = [
  { id: "a", word: "abandon", meaning: "포기하다", pos: "동사", createdAt: 1, correct: 0, wrong: 2, streak: 0, examples: [{ sentence: "They abandoned the car.", translation: "그들은 차를 버렸다." }] },
  { id: "b", word: "brief", meaning: "짧은", pos: "형용사", createdAt: 2, correct: 3, wrong: 0, streak: 3, examples: [] },
  { id: "c", word: "cease", meaning: "중단하다", pos: "동사", createdAt: 3, correct: 1, wrong: 1, streak: 1, starred: true, examples: [] },
  { id: "d", word: "diligent", meaning: "부지런한", pos: "형용사", createdAt: 4, correct: 0, wrong: 0, streak: 0, examples: [] },
  { id: "e", word: "eager", meaning: "열망하는", pos: "형용사", createdAt: 5, correct: 0, wrong: 0, streak: 0, examples: [] },
  { id: "f", word: "flee", meaning: "달아나다", pos: "동사", createdAt: 6, correct: 2, wrong: 1, streak: 2, examples: [] },
];

test("범위", () => {
  assert.deepEqual(wordsInScope(words, "review").map((w) => w.id), ["a", "c"]);
  assert.deepEqual(wordsInScope(words, "new").map((w) => w.id), ["d", "e"]);
  assert.deepEqual(wordsInScope(words, "starred").map((w) => w.id), ["c"]);
  assert.deepEqual(wordsInScope(words, "recent").map((w) => w.id), ["f", "e", "d", "c", "b", "a"]);
  assert.equal(wordsInScope(words, "nope").length, words.length);
  assert.equal(needsReview(words[5]), false);
});

test("문제 수만큼 고르고 0 이면 전부", () => {
  assert.equal(pickTargets(words, { scope: "all", count: 3 }, seeded()).length, 3);
  assert.equal(pickTargets(words, { scope: "all", count: 0 }, seeded()).length, words.length);
  assert.equal(pickTargets(words, { scope: "new", count: 10 }, seeded()).length, 2);
});

test("5지선다: 보기 5개, 정답 포함, 중복 없음", () => {
  for (const dir of ["w2m", "m2w", "mix"]) {
    const qs = buildChoiceQuestions(words, words, dir, seeded(7));
    assert.equal(qs.length, words.length);
    for (const q of qs) {
      assert.equal(q.options.length, OPTION_COUNT);
      assert.equal(new Set(q.options.map((o) => o.text)).size, OPTION_COUNT);
      assert.equal(q.options[q.answer].id, q.word.id);
      assert.equal(q.prompt, q.mode === "w2m" ? q.word.word : q.word.meaning);
      const field = q.mode === "w2m" ? "meaning" : "word";
      assert.equal(q.options[q.answer].text, q.word[field]);
    }
  }
});

test("5지선다: 품사가 같은 오답을 먼저 쓴다", () => {
  const verbs = [...words, { id: "g", word: "grasp", meaning: "붙잡다", pos: "동사", examples: [] }, { id: "h", word: "halt", meaning: "멈추다", pos: "동사", examples: [] }];
  const [q] = buildChoiceQuestions([verbs[0]], verbs, "w2m", seeded(3));
  const posOf = (id) => verbs.find((w) => w.id === id).pos;
  assert.ok(q.options.every((o) => posOf(o.id) === "동사"));
});

test("뜻이 서로 다른 단어가 5개 미만이면 5지선다 불가", () => {
  assert.equal(canBuildChoice(words.slice(0, 4)), false);
  const same = words.slice(0, 5).map((w, i) => ({ ...w, meaning: i < 2 ? "같은 뜻" : w.meaning }));
  assert.equal(canBuildChoice(same), false);
  assert.equal(canBuildChoice(words), true);
});

test("URL 설정 읽기", () => {
  assert.deepEqual(readTestSettings(new URLSearchParams("scope=review&count=20&dir=m2w")), { scope: "review", count: 20, dir: "m2w" });
  assert.deepEqual(readTestSettings(new URLSearchParams("scope=bad&count=-3&dir=x")), { scope: "all", count: 10, dir: "w2m" });
  assert.equal(readTestSettings(new URLSearchParams("count=0")).count, 0);
});

test("AI 없을 때 빈칸: 저장된 예문 → 뜻 문제", () => {
  assert.deepEqual(fallbackBlank(words[0]), { sentence: "They _____ the car.", answer: "abandoned", translation: "그들은 차를 버렸다.", source: "example" });
  assert.equal(fallbackBlank(words[1]).source, "meaning");
});

test("요약", () => {
  const s = summarize(words);
  assert.equal(s.total, 6);
  assert.equal(s.review, 2);
  assert.equal(s.mastered, 1);
  assert.equal(s.fresh, 2);
  assert.equal(Math.round(s.accuracy * 100), 60);
  assert.equal(summarize([]).accuracy, null);
});
