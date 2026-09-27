// AI 기능: 뜻·예문 생성, 빈칸 문제 생성
import { generateJson, AiError } from "./gemini.js";

const clean = (v, max = 200) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

const WORD_SCHEMA = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          word: { type: "STRING" },
          meaning: { type: "STRING" },
          partOfSpeech: { type: "STRING" },
          pronunciation: { type: "STRING" },
          examples: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: { sentence: { type: "STRING" }, translation: { type: "STRING" } },
              required: ["sentence", "translation"],
            },
          },
        },
        required: ["word", "meaning", "partOfSpeech", "pronunciation", "examples"],
      },
    },
  },
  required: ["items"],
};

/** words: 문자열 배열 (최대 20개) → [{ word, meaning, partOfSpeech, pronunciation, examples }] */
export async function aiWords(env, words) {
  const list = [...new Set((words || []).map((w) => clean(w, 60)).filter(Boolean))].slice(0, 20);
  if (!list.length) throw new AiError(400, "단어를 입력하세요.");
  const prompt = `당신은 한국인 학습자를 위한 사전 편찬자입니다.
다음 단어(또는 숙어)마다 한국어 뜻, 품사(한국어, 예: 명사/동사), 발음기호(IPA), 자연스러운 예문 2개와 한국어 번역을 만드세요.
뜻은 대표 뜻 1~3개를 쉼표로 짧게. 입력의 철자가 틀렸다면 word에 올바른 철자를 넣으세요.
단어 목록: ${JSON.stringify(list)}`;
  const data = await generateJson(env, prompt, WORD_SCHEMA);
  return (data.items || []).slice(0, list.length).map((it) => ({
    word: clean(it.word, 60),
    meaning: clean(it.meaning),
    partOfSpeech: clean(it.partOfSpeech, 30),
    pronunciation: clean(it.pronunciation, 60),
    examples: (it.examples || []).slice(0, 3).map((e) => ({ sentence: clean(e.sentence, 300), translation: clean(e.translation, 300) })),
  }));
}

const BLANK_SCHEMA = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          sentence: { type: "STRING" },
          answer: { type: "STRING" },
          translation: { type: "STRING" },
        },
        required: ["id", "sentence", "answer", "translation"],
      },
    },
  },
  required: ["items"],
};

/** 빈칸 문장에서 정답이 들어갈 자리를 "_____"로 표준화 */
export function normalizeBlank(sentence, answer) {
  let s = clean(sentence, 300).replace(/_{2,}|\[\s*blank\s*\]|\(\s*\)/gi, "_____");
  if (!s.includes("_____") && answer) {
    const re = new RegExp(`\\b${answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(s)) s = s.replace(re, "_____");
  }
  return s.includes("_____") ? s : null;
}

/** items: [{ id, word, meaning }] (최대 30개) → [{ id, sentence, answer, translation }] */
export async function aiBlanks(env, items) {
  const list = (items || [])
    .slice(0, 30)
    .map((it) => ({ id: clean(it.id, 80), word: clean(it.word, 60), meaning: clean(it.meaning, 100) }))
    .filter((it) => it.id && it.word);
  if (!list.length) throw new AiError(400, "문제로 낼 단어가 없습니다.");
  const prompt = `영어(또는 해당 언어) 빈칸 채우기 시험 문제를 만드세요.
각 단어마다 그 단어가 꼭 들어가야 자연스러운 새 예문 1개를 쓰고, 그 단어 자리를 "_____"(밑줄 5개)로 바꾸세요.
answer에는 빈칸에 들어갈 실제 형태(활용형 포함)를 넣고, translation에는 문장 전체의 한국어 번역을 넣으세요.
id는 입력값 그대로 돌려주세요. 너무 쉬운 문장은 피하고, 문맥으로 정답을 추론할 수 있게 하세요.
단어 목록: ${JSON.stringify(list)}`;
  const data = await generateJson(env, prompt, BLANK_SCHEMA);
  const byId = new Map(list.map((it) => [it.id, it]));
  const out = [];
  for (const it of data.items || []) {
    const src = byId.get(clean(it.id, 80));
    if (!src) continue;
    const answer = clean(it.answer, 60) || src.word;
    const sentence = normalizeBlank(it.sentence, answer);
    if (sentence) out.push({ id: src.id, sentence, answer, translation: clean(it.translation, 300) });
  }
  return out;
}
