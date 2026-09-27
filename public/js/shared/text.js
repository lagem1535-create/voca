// 서버(Worker)와 브라우저가 함께 쓰는 순수 텍스트 도우미입니다. (DOM·Firebase 의존성 없음)

// 단어 경계(띄어쓰기)가 있는 문자 체계: 이 경우 "run"이 "running" 안에서 잡히지 않도록 경계를 지킵니다.
const BOUNDARY_SCRIPTS = /[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}]/u;

/** 앞뒤 공백을 없애고 연속 공백을 하나로 합칩니다. */
export function cleanText(value, maxLength = 500) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/** 채점용 정규화: 대소문자, 둥근 따옴표, 앞뒤 문장부호, 여러 칸 공백 차이를 무시합니다. */
export function normalizeAnswer(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 문장 안에서 목표 단어(또는 표현)가 처음 나오는 위치를 찾습니다. */
export function locateTerm(sentence, term) {
  const text = String(sentence ?? "");
  const target = cleanText(term, 200);
  if (!text || !target) return null;
  const pattern = target.split(" ").map(escapeRegExp).join("\\s+");
  const source = BOUNDARY_SCRIPTS.test(target)
    ? `(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`
    : pattern;
  const match = new RegExp(source, "iu").exec(text);
  return match ? { index: match.index, text: match[0] } : null;
}

/**
 * 후보 단어(활용형 → 원형 순) 중 문장에 실제로 나오는 것을 빈칸으로 바꾼 조각을 돌려줍니다.
 * 어느 후보도 없으면 null.
 */
export function makeBlank(sentence, candidates) {
  const text = String(sentence ?? "");
  for (const candidate of candidates) {
    const hit = locateTerm(text, candidate);
    if (hit) {
      return {
        before: text.slice(0, hit.index),
        answer: hit.text,
        after: text.slice(hit.index + hit.text.length),
      };
    }
  }
  return null;
}

/** 여러 단어 입력(줄바꿈·쉼표·세미콜론 구분)을 중복 없이 나눕니다. */
export function splitWordList(text) {
  const seen = new Set();
  const words = [];
  for (const part of String(text ?? "").split(/[\n,;]+/)) {
    const word = cleanText(part, 200);
    if (!word || seen.has(word.toLowerCase())) continue;
    seen.add(word.toLowerCase());
    words.push(word);
  }
  return words;
}
