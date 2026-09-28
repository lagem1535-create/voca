import test from "node:test";
import assert from "node:assert/strict";
import { BLANK, splitTerms, uniqueTerms, normalizeAnswer, findWordForm, makeBlank, checkAnswer, editDistance } from "../public/js/shared/text.js";

test("여러 단어 입력 나누기", () => {
  assert.deepEqual(splitTerms("abandon\n take off , Reluctant;abandon\n1. apple\n- banana\t cherry\n\n"), [
    "abandon",
    "take off",
    "Reluctant",
    "apple",
    "banana",
    "cherry",
  ]);
  assert.deepEqual(uniqueTerms(["A", "a", " b ", ""]), ["A", "b"]);
});

test("채점 정규화", () => {
  assert.equal(normalizeAnswer("  Don’t!  "), "don't");
  assert.equal(normalizeAnswer("Take   OFF."), "take off");
  assert.equal(normalizeAnswer("ＡＢＣ"), "abc");
});

test("문장 속 활용형 찾기", () => {
  assert.equal(findWordForm("She abandoned the plan.", "abandon"), "abandoned");
  assert.equal(findWordForm("He is making dinner.", "make"), "making");
  assert.equal(findWordForm("They carried the box.", "carry"), "carried");
  assert.equal(findWordForm("The bus stopped.", "stop"), "stopped");
  assert.equal(findWordForm("The exact act.", "act"), "act");
  assert.equal(findWordForm("Nothing here.", "apple"), null);
  assert.equal(findWordForm("私は毎日りんごを食べる。", "りんご"), "りんご");
});

test("빈칸 만들기", () => {
  assert.deepEqual(makeBlank("She ___ the plan.", "abandoned", "abandon"), { sentence: `She ${BLANK} the plan.`, answer: "abandoned" });
  assert.deepEqual(makeBlank("She [blank] the plan.", "", "abandon"), { sentence: `She ${BLANK} the plan.`, answer: "abandon" });
  assert.deepEqual(makeBlank("The exact act was bold.", "", "act"), { sentence: `The exact ${BLANK} was bold.`, answer: "act" });
  assert.deepEqual(makeBlank("She abandoned it.", "abandoned", "abandon"), { sentence: `She ${BLANK} it.`, answer: "abandoned" });
  assert.equal(makeBlank("___ and ___", "x", "x"), null);
  assert.equal(makeBlank("no target here", "apple", "apple"), null);
});

test("빈칸 채점: 활용형·기본형 정답, 한 글자 차이는 아까움", () => {
  const q = { answer: "abandoned", word: "abandon" };
  assert.deepEqual(checkAnswer("Abandoned", q), { correct: true, exact: true });
  assert.deepEqual(checkAnswer("abandon", q), { correct: true, exact: false });
  assert.deepEqual(checkAnswer("abandond", q), { correct: false, near: true });
  assert.deepEqual(checkAnswer("left", q), { correct: false, near: false });
  assert.deepEqual(checkAnswer("   ", q), { correct: false, near: false });
  assert.equal(checkAnswer("take off", { answer: "took off", word: "take off" }).correct, true);
  assert.equal(editDistance("kitten", "sitting"), 3);
});
