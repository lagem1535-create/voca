import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanText, locateTerm, makeBlank, normalizeAnswer } from "../public/js/shared/text.js";

test("cleanText는 공백을 정리하고 길이를 자른다", () => {
  assert.equal(cleanText("  a \n  b  "), "a b");
  assert.equal(cleanText("abcdef", 3), "abc");
  assert.equal(cleanText(null), "");
});

test("normalizeAnswer는 대소문자·둥근 따옴표·앞뒤 문장부호를 무시한다", () => {
  assert.equal(normalizeAnswer("  Don’t! "), "don't");
  assert.equal(normalizeAnswer("Look   Forward To"), "look forward to");
  assert.equal(normalizeAnswer("“apple.”"), "apple");
});

test("locateTerm은 단어 경계를 지킨다", () => {
  assert.equal(locateTerm("I am running late.", "run"), null);
  assert.deepEqual(locateTerm("Run! I said RUN.", "run"), { index: 0, text: "Run" });
  assert.deepEqual(locateTerm("We look  forward to it.", "look forward to"), { index: 3, text: "look  forward to" });
  assert.deepEqual(locateTerm("This is C++ code.", "C++"), { index: 8, text: "C++" });
});

test("locateTerm은 띄어쓰기 없는 언어도 찾는다", () => {
  assert.deepEqual(locateTerm("私は毎日走ります。", "走ります"), { index: 4, text: "走ります" });
});

test("makeBlank는 활용형 → 원형 순으로 찾아 빈칸 조각을 만든다", () => {
  assert.deepEqual(makeBlank("She ran to the station.", ["ran", "run"]), {
    before: "She ",
    answer: "ran",
    after: " to the station.",
  });
  assert.deepEqual(makeBlank("He will run.", ["", "run"]), { before: "He will ", answer: "run", after: "." });
  assert.equal(makeBlank("Nothing here.", ["run"]), null);
});
