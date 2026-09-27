// POST /api/ai/blank — AI 빈칸 시험 문제 생성
// 요청: { "items": [{ "id": "문서ID", "word": "run", "meaning": "달리다" }] }
// 응답: { "questions": [{ id, word, answer, before, after, sentence, translation }], "missing": [], "model": "..." }
//   before + (빈칸 = answer) + after = sentence

import { HttpError, json, readJson } from "../lib/http.js";
import { parseFirebaseConfig } from "../lib/firebase-config.js";
import { requireUser } from "../lib/auth.js";
import { generateJson } from "../lib/gemini.js";
import { cleanText, makeBlank } from "../../public/js/shared/text.js";

export const MAX_ITEMS = 20;

const SYSTEM = `당신은 한국어 사용자를 위한 외국어 어휘 빈칸 시험 출제자입니다.
각 단어마다 그 단어가 들어가야 자연스러운 새 예문을 하나씩 만듭니다.

규칙
- questions 배열에 입력 순서대로, 입력 항목마다 정확히 하나씩 작성합니다.
- word: 입력 단어 철자를 그대로 씁니다.
- sentence: 목표 단어가 정확히 한 번 들어간 완성된 원어 문장(8~18단어). 앞뒤 문맥만으로 정답을 짐작할 수 있게 만들고, 빈칸 표시(___)는 넣지 않습니다.
- 주어진 한국어 뜻(meaning)에 맞는 의미로 사용합니다.
- 가능하면 입력한 형태 그대로 쓰고, 문법상 필요할 때만 활용형(시제·복수형 등)을 씁니다.
- answer: sentence 안에 실제로 쓴 목표 단어의 형태를 그대로 씁니다. (예: run → ran)
- translation: sentence 전체의 자연스러운 한국어 번역.
- 설명이나 마크다운 없이 JSON만 출력합니다.`;

const SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          word: { type: "string" },
          answer: { type: "string" },
          sentence: { type: "string" },
          translation: { type: "string" },
        },
        required: ["word", "answer", "sentence", "translation"],
      },
    },
  },
  required: ["questions"],
};

export function parseBlankRequest(body) {
  const rawItems = Array.isArray(body?.items) ? body.items : [];
  const seen = new Set();
  const items = [];
  for (const raw of rawItems) {
    const word = cleanText(raw?.word, 200);
    if (!word || seen.has(word.toLowerCase())) continue;
    if (word.length > 60) throw new HttpError(400, "word_too_long", "단어·표현은 60자 이하여야 합니다.");
    seen.add(word.toLowerCase());
    items.push({
      id: cleanText(raw?.id, 100),
      word,
      meaning: cleanText(raw?.meaning, 120),
    });
  }
  if (!items.length) throw new HttpError(400, "no_words", "문제로 낼 단어가 없습니다.");
  if (items.length > MAX_ITEMS) {
    throw new HttpError(400, "too_many_words", `한 번에 최대 ${MAX_ITEMS}문제까지 만들 수 있습니다.`);
  }
  return items;
}

export function buildBlankQuestions(data, items) {
  const list = Array.isArray(data?.questions) ? data.questions : Array.isArray(data) ? data : [];
  const byWord = new Map();
  for (const question of list) {
    const key = cleanText(question?.word, 200).toLowerCase();
    if (key && !byWord.has(key)) byWord.set(key, question);
  }
  const questions = [];
  const missing = [];
  items.forEach((item, index) => {
    const question = byWord.get(item.word.toLowerCase()) ?? (list.length === items.length ? list[index] : null);
    const sentence = cleanText(question?.sentence, 400);
    const blank = sentence ? makeBlank(sentence, [cleanText(question?.answer, 200), item.word]) : null;
    if (!blank) {
      missing.push(item.id || item.word);
      return;
    }
    questions.push({
      id: item.id,
      word: item.word,
      answer: blank.answer,
      before: blank.before,
      after: blank.after,
      sentence,
      translation: cleanText(question?.translation, 400),
    });
  });
  return { questions, missing };
}

export async function handleAiBlank(request, env) {
  const { config, error } = parseFirebaseConfig(env.FIREBASE_CONFIG);
  if (!config) throw new HttpError(500, "firebase_config_missing", error);
  await requireUser(request, env, config);

  const items = parseBlankRequest(await readJson(request));
  const prompt = `문제로 낼 단어(JSON): ${JSON.stringify(items.map(({ word, meaning }) => ({ word, meaning })))}`;
  const { data, model } = await generateJson({
    env,
    system: SYSTEM,
    prompt,
    schema: SCHEMA,
    maxOutputTokens: 2048 + items.length * 400,
  });
  const { questions, missing } = buildBlankQuestions(data, items);
  if (!questions.length) {
    throw new HttpError(502, "ai_bad_output", "AI가 빈칸 문제를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  return json({ questions, missing, model });
}
