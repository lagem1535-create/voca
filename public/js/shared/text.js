// 텍스트 도우미 — 브라우저와 Worker(src/ai/*)가 함께 씁니다. DOM 이나 Firebase 에 의존하지 않습니다.

export const BLANK = "_____";

/** 공백 정리 + 길이 제한 */
export function clean(value, max = 200) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** 같은 단어인지 비교할 때 쓰는 키 (대소문자·전각 무시) */
export function termKey(value) {
  return clean(value, 200).normalize("NFKC").toLowerCase();
}

/** 앞뒤 공백을 정리하고 대소문자를 무시해 중복을 뺀 목록 */
export function uniqueTerms(list, max = 80) {
  const seen = new Set();
  const out = [];
  for (const raw of list || []) {
    const term = clean(raw, max);
    const key = termKey(term);
    if (!term || seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  return out;
}

/** 여러 단어 입력(줄바꿈·쉼표·세미콜론·탭 구분, "1. " 같은 번호 허용) → 단어 목록 */
export function splitTerms(text) {
  return uniqueTerms(
    String(text ?? "")
      .split(/[\n,;\t]+/)
      .map((s) => s.replace(/^\s*(?:\d+[.)]|[-*•·])\s+/, "")),
  );
}

/** 채점용 정규화: 대소문자, 따옴표 모양, 문장부호, 공백 차이를 없앱니다 */
export function normalizeAnswer(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/[^\p{L}\p{N}\p{M}'\- ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^['-]+|['-]+$/g, "");
}

export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const NO_SPACE_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/u;

function matchWordForm(sentence, word) {
  const text = String(sentence ?? "");
  const w = clean(word, 100);
  if (!text || !w) return null;
  if (NO_SPACE_SCRIPT.test(w)) {
    const index = text.indexOf(w);
    return index >= 0 ? { text: w, index } : null;
  }
  const stems = new Set([escapeRegExp(w)]);
  if (/e$/i.test(w)) stems.add(escapeRegExp(w.slice(0, -1))); // make → making
  if (/[^aeiou]y$/i.test(w)) stems.add(`${escapeRegExp(w.slice(0, -1))}i`); // carry → carried
  if (/[^aeiou][aeiou][bdgklmnprtz]$/i.test(w)) stems.add(escapeRegExp(w + w.slice(-1))); // stop → stopped
  const alternatives = [...stems].sort((a, b) => b.length - a.length).join("|");
  // 앞 글자 검사는 lookbehind 대신 캡처 그룹으로 (구형 iOS Safari 호환)
  const re = new RegExp(
    `(^|[^\\p{L}\\p{N}])((?:${alternatives})(?:s|es|ed|d|ing|er|ers|est|ly|ies|ied)?)(?![\\p{L}\\p{N}])`,
    "iu",
  );
  const m = re.exec(text);
  return m ? { text: m[2], index: m.index + m[1].length } : null;
}

/** 문장 속에서 word 가 실제로 쓰인 형태(활용형 포함)를 찾습니다. 없으면 null */
export function findWordForm(sentence, word) {
  return matchWordForm(sentence, word)?.text ?? null;
}

/**
 * 빈칸 문장을 만듭니다.
 * - 이미 빈칸 표시(___, [blank] 등)가 하나 있으면 "_____" 로 통일
 * - 없으면 answer → word 순서로 문장에서 찾아 빈칸으로 바꿈
 * @returns {{sentence: string, answer: string}|null}
 */
export function makeBlank(sentence, answer, word) {
  const s = clean(sentence, 400).replace(/_{2,}|＿{2,}|\[\s*(?:blank|빈칸)\s*\]|\{\s*(?:blank|빈칸)\s*\}/giu, BLANK);
  const count = s.split(BLANK).length - 1;
  if (count === 1) return { sentence: s, answer: clean(answer, 80) || clean(word, 80) };
  if (count > 1) return null;
  for (const target of [answer, word]) {
    const m = matchWordForm(s, target);
    if (m) {
      return { sentence: s.slice(0, m.index) + BLANK + s.slice(m.index + m.text.length), answer: m.text };
    }
  }
  return null;
}

export function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length || !b.length) return a.length || b.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * 빈칸 답 채점. 빈칸에 들어간 형태(answer)와 기본형(word) 모두 정답으로 봅니다.
 * @returns {{correct: boolean, exact?: boolean, near?: boolean}}
 */
export function checkAnswer(input, { answer, word }) {
  const given = normalizeAnswer(input);
  if (!given) return { correct: false, near: false };
  const exact = normalizeAnswer(answer);
  const base = normalizeAnswer(word);
  if (given === exact || (!exact && given === base)) return { correct: true, exact: true };
  if (given === base) return { correct: true, exact: false };
  const near = [exact, base].some((t) => t && t.length >= 4 && editDistance(given, t) === 1);
  return { correct: false, near };
}
