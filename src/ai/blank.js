// AI 빈칸 시험: 프롬프트와 응답 정리
import { clean, makeBlank } from "../../public/js/shared/text.js";

export const BLANK_SCHEMA = {
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

/** 요청 본문의 items → 정리된 문제 재료 (id 중복 제거) */
export function cleanBlankInputs(list, max = 30) {
  const seen = new Set();
  const out = [];
  for (const it of Array.isArray(list) ? list : []) {
    const id = clean(it?.id, 80);
    const word = clean(it?.word, 80);
    if (!id || !word || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, word, meaning: clean(it?.meaning, 120), pos: clean(it?.pos, 30) });
    if (out.length >= max) break;
  }
  return out;
}

export function buildBlankPrompt(items) {
  return `외국어 단어 빈칸 채우기 시험 문제를 만드세요. 목록의 항목마다 한 문제씩 만듭니다.

1. 단어(word)가 주어진 뜻(meaning)으로 쓰이는 새롭고 자연스러운 예문을 그 단어의 언어로 하나 씁니다. (중급 수준, 10~18단어)
2. 문맥만 보고도 정답을 떠올릴 수 있게 쓰고, 다른 흔한 단어가 똑같이 들어갈 수 있는 문장은 피합니다.
3. 문장에서 그 단어가 쓰인 자리(활용형 포함, 숙어는 전체)를 정확히 한 번 "_____"(밑줄 5개)로 바꿉니다. 정답 단어가 문장의 다른 곳에 또 나오면 안 됩니다.
4. answer: 빈칸에 들어갈 정확한 형태 (예: abandon → abandoned)
5. translation: 빈칸을 채운 완성 문장의 자연스러운 한국어 번역
6. id: 입력의 id 를 그대로

목록: ${JSON.stringify(items)}`;
}

/**
 * 모델 응답을 문제로 정리합니다. 빈칸이 정확히 하나인 문장만 남깁니다.
 * @returns {{items: object[], missing: string[]}}
 */
export function sanitizeBlankItems(rawItems, inputs) {
  const byId = new Map(inputs.map((it) => [it.id, it]));
  const done = new Set();
  const items = [];
  for (const it of Array.isArray(rawItems) ? rawItems : []) {
    const src = byId.get(clean(it?.id, 80));
    if (!src || done.has(src.id)) continue;
    const blank = makeBlank(it.sentence, it.answer, src.word);
    if (!blank) continue;
    done.add(src.id);
    items.push({ id: src.id, sentence: blank.sentence, answer: blank.answer, translation: clean(it.translation, 400) });
  }
  return { items, missing: inputs.filter((it) => !done.has(it.id)).map((it) => it.id) };
}
