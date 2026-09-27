// POST /api/ai/word — 단어의 한국어 뜻·품사·발음·예문을 Gemini로 생성
// 요청: { "words": ["apple", "run"], "exampleCount": 2 }
// 응답: { "items": [{ word, corrected, language, partOfSpeech, pronunciation, meaning, examples: [{ sentence, translation }] }], "missing": [], "model": "..." }

import { HttpError, json, readJson } from "../lib/http.js";
import { parseFirebaseConfig } from "../lib/firebase-config.js";
import { requireUser } from "../lib/auth.js";
import { generateJson } from "../lib/gemini.js";
import { cleanText } from "../../public/js/shared/text.js";

export const MAX_WORDS = 20;
const MAX_WORD_LENGTH = 60;

const SYSTEM = `당신은 한국어 사용자를 위한 외국어 어휘 사전 편집자입니다.
사용자가 준 단어(또는 숙어·표현) 목록의 각 항목에 대해 학습용 단어장 정보를 JSON으로 작성합니다.

규칙
- items 배열에 입력 순서대로, 입력 항목마다 정확히 하나씩 작성합니다.
- word: 입력한 철자를 그대로 씁니다.
- corrected: 입력에 명백한 오타가 있으면 올바른 철자, 없으면 빈 문자열.
- language: 단어의 언어 코드(ISO 639-1, 예: en, ja, zh, es, fr, de).
- partOfSpeech: 주요 품사를 한국어로(명사, 동사, 형용사, 부사, 전치사, 접속사, 대명사, 감탄사, 숙어 등). 여러 개면 쉼표로 구분합니다.
- pronunciation: 영어는 IPA 발음기호(/.../), 일본어는 히라가나 읽기, 중국어는 병음, 그 밖의 언어는 가장 널리 쓰는 발음 표기. 모르면 빈 문자열.
- meaning: 자주 쓰이는 한국어 뜻 1~3개를 빈도순으로 쉼표로 구분해 사전식으로 간결하게 씁니다. (예: "달리다, 운영하다, 작동하다")
- examples: 요청한 개수만큼, 목표 단어를 그대로 포함한 자연스러운 원어 예문(sentence)과 자연스러운 한국어 번역(translation). 중급 학습자가 이해할 수 있는 일상적인 문장(6~16단어)으로, 가능하면 예문마다 다른 뜻이나 상황을 보여줍니다.
- 존재하지 않는 단어라면 meaning을 "(알 수 없는 단어)"로, examples는 빈 배열로 둡니다.
- 설명이나 마크다운 없이 JSON만 출력합니다.`;

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          word: { type: "string" },
          corrected: { type: "string" },
          language: { type: "string" },
          partOfSpeech: { type: "string" },
          pronunciation: { type: "string" },
          meaning: { type: "string" },
          examples: {
            type: "array",
            items: {
              type: "object",
              properties: {
                sentence: { type: "string" },
                translation: { type: "string" },
              },
              required: ["sentence", "translation"],
            },
          },
        },
        required: ["word", "corrected", "language", "partOfSpeech", "pronunciation", "meaning", "examples"],
      },
    },
  },
  required: ["items"],
};

export function parseWordRequest(body) {
  const rawList = Array.isArray(body?.words) ? body.words : typeof body?.word === "string" ? [body.word] : [];
  const seen = new Set();
  const words = [];
  for (const raw of rawList) {
    const word = cleanText(raw, 200);
    if (!word || seen.has(word.toLowerCase())) continue;
    seen.add(word.toLowerCase());
    words.push(word);
  }
  if (!words.length) throw new HttpError(400, "no_words", "단어를 입력해 주세요.");
  if (words.length > MAX_WORDS) {
    throw new HttpError(400, "too_many_words", `한 번에 최대 ${MAX_WORDS}개까지 만들 수 있습니다.`);
  }
  const tooLong = words.find((word) => word.length > MAX_WORD_LENGTH);
  if (tooLong) throw new HttpError(400, "word_too_long", `단어·표현은 ${MAX_WORD_LENGTH}자 이하로 입력해 주세요.`);
  const count = Number.parseInt(body?.exampleCount, 10);
  const exampleCount = Number.isFinite(count) ? Math.min(3, Math.max(1, count)) : 2;
  return { words, exampleCount };
}

function languageCode(value) {
  const code = cleanText(value, 20).toLowerCase();
  return /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(code) ? code : "";
}

export function normalizeWordItems(data, words, exampleCount) {
  const list = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
  const byWord = new Map();
  for (const item of list) {
    const key = cleanText(item?.word, 200).toLowerCase();
    if (key && !byWord.has(key)) byWord.set(key, item);
  }
  const items = [];
  const missing = [];
  words.forEach((word, index) => {
    const item = byWord.get(word.toLowerCase()) ?? (list.length === words.length ? list[index] : null);
    const meaning = cleanText(item?.meaning, 200);
    if (!item || !meaning) {
      missing.push(word);
      return;
    }
    const examples = (Array.isArray(item.examples) ? item.examples : [])
      .map((example) => ({
        sentence: cleanText(example?.sentence, 300),
        translation: cleanText(example?.translation, 300),
      }))
      .filter((example) => example.sentence)
      .slice(0, exampleCount);
    const corrected = cleanText(item.corrected, 200);
    items.push({
      word,
      corrected: corrected && corrected.toLowerCase() !== word.toLowerCase() ? corrected : "",
      language: languageCode(item.language),
      partOfSpeech: cleanText(item.partOfSpeech, 60),
      pronunciation: cleanText(item.pronunciation, 80),
      meaning,
      examples,
    });
  });
  return { items, missing };
}

export async function handleAiWord(request, env) {
  const { config, error } = parseFirebaseConfig(env.FIREBASE_CONFIG);
  if (!config) throw new HttpError(500, "firebase_config_missing", error);
  await requireUser(request, env, config);

  const { words, exampleCount } = parseWordRequest(await readJson(request));
  const prompt = `예문 개수: ${exampleCount}\n단어 목록(JSON): ${JSON.stringify(words)}`;
  const { data, model } = await generateJson({
    env,
    system: SYSTEM,
    prompt,
    schema: SCHEMA,
    maxOutputTokens: 2048 + words.length * 700,
  });
  const { items, missing } = normalizeWordItems(data, words, exampleCount);
  if (!items.length) {
    throw new HttpError(502, "ai_bad_output", "AI가 뜻을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  return json({ items, missing, model });
}
