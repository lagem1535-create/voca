// AI 뜻·예문: 프롬프트와 응답 정리
import { clean, termKey } from "../../public/js/shared/text.js";

export const WORD_SCHEMA = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          input: { type: "STRING" },
          word: { type: "STRING" },
          lang: { type: "STRING" },
          meaning: { type: "STRING" },
          pos: { type: "STRING" },
          pronunciation: { type: "STRING" },
          examples: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                sentence: { type: "STRING" },
                translation: { type: "STRING" },
              },
              required: ["sentence", "translation"],
            },
          },
        },
        required: ["input", "word", "lang", "meaning", "pos", "pronunciation", "examples"],
      },
    },
  },
  required: ["items"],
};

export function buildWordPrompt(words) {
  return `당신은 한국어 사용자를 위한 외국어 단어장의 사전 편찬자입니다.
아래 "단어 목록"의 항목(단어·숙어·구동사)마다 한 개씩, 목록 순서대로 결과를 만드세요.

- input: 목록에 적힌 그대로
- word: 표제어. 철자가 틀렸으면 바로잡고 사전 표기대로 씁니다(영어는 고유명사가 아니면 소문자). 한국어가 들어오면 가장 흔한 영어 단어로 바꿔 주세요.
- lang: 표제어의 언어 코드 (영어 en, 일본어 ja, 중국어 zh, 스페인어 es, 프랑스어 fr, 독일어 de …)
- meaning: 가장 많이 쓰는 한국어 뜻 1~3개를 쉼표로 구분한 짧은 사전식 뜻 (예: "포기하다, 버리다")
- pos: 한국어 품사 하나 (명사, 동사, 형용사, 부사, 전치사, 접속사, 대명사, 감탄사, 구동사, 숙어)
- pronunciation: 영어 등은 IPA(예: /əˈbændən/), 일본어는 히라가나 읽기, 중국어는 병음
- examples: 표제어를 그대로 또는 활용형으로 넣은 자연스러운 예문 2개(중급 수준, 8~16단어)와 각 문장의 자연스러운 한국어 번역(translation)

단어 목록: ${JSON.stringify(words)}`;
}

function cleanLang(value) {
  const lang = clean(value, 20).toLowerCase();
  return /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(lang) ? lang : "en";
}

function cleanExamples(list) {
  return (Array.isArray(list) ? list : [])
    .map((e) => ({ sentence: clean(e?.sentence, 300), translation: clean(e?.translation, 300) }))
    .filter((e) => e.sentence)
    .slice(0, 3);
}

/**
 * 모델 응답 items 를 입력 순서에 맞춰 정리합니다.
 * @returns {{items: object[], missing: string[]}}
 */
export function sanitizeWordItems(rawItems, inputs) {
  const list = Array.isArray(rawItems) ? rawItems : [];
  const byInput = new Map(list.map((it) => [termKey(it?.input), it]));
  const items = [];
  const missing = [];
  inputs.forEach((input, i) => {
    const it = byInput.get(termKey(input)) ?? (list.length === inputs.length ? list[i] : null);
    const meaning = clean(it?.meaning, 200);
    if (!it || !meaning) {
      missing.push(input);
      return;
    }
    items.push({
      input,
      word: clean(it.word, 80) || input,
      lang: cleanLang(it.lang),
      meaning,
      pos: clean(it.pos, 30),
      pronunciation: clean(it.pronunciation, 80),
      examples: cleanExamples(it.examples),
    });
  });
  return { items, missing };
}
