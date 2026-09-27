import { test } from "node:test";
import assert from "node:assert/strict";
import { pickWords, buildChoiceQuestions, checkBlank, localBlank } from "../public/js/quiz.js";

const words = "apple banana cherry grape lemon mango peach".split(" ").map((w, i) => ({
  id: `id${i}`, word: w, meaning: `뜻${i}`, wrong: i % 2, correct: 0, createdAt: i, lastTestedAt: i < 3 ? 1 : 0,
}));

test("5지선다: 보기 5개, 정답 포함, 중복 없음", () => {
  for (const q of buildChoiceQuestions(words.slice(0, 3), words, "mix")) {
    assert.equal(q.options.length, 5);
    assert.equal(new Set(q.options).size, 5);
    assert.ok(q.answer >= 0);
  }
  const [q] = buildChoiceQuestions([words[0]], words.slice(0, 2), "w2m");
  assert.equal(q.options.length, 2);
  assert.equal(q.options[q.answer], "뜻0");
});

test("범위 선택", () => {
  assert.equal(pickWords(words, { scope: "all", count: 3 }).length, 3);
  assert.ok(pickWords(words, { scope: "wrong", count: 10 }).every((w) => w.wrong > 0));
  assert.ok(pickWords(words, { scope: "new", count: 10 }).every((w) => !w.lastTestedAt));
});

test("빈칸 채점과 저장 예문 대체", () => {
  assert.ok(checkBlank(" Abandoned ", ["abandoned", "abandon"]));
  assert.ok(checkBlank("abandon", ["abandoned", "abandon"]));
  assert.ok(!checkBlank("", ["a"]));
  const q = localBlank({ id: "x", word: "run", examples: [{ sentence: "He runs fast.", translation: "t" }] });
  assert.equal(q.sentence, "He _____ fast.");
  assert.equal(q.answer, "runs");
  assert.equal(localBlank({ id: "y", word: "zzz", examples: [] }), null);
});
