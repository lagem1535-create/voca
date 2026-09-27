// 시험 로직 (브라우저·테스트 공용, DOM 없음)

export function shuffle(list, rand = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 범위에 맞는 단어를 골라 count개 섞어서 돌려줍니다. scope: all | recent | wrong | new */
export function pickWords(words, { scope = "all", count = 10 } = {}, rand = Math.random) {
  let pool = words;
  if (scope === "recent") pool = [...words].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, Math.max(count, 20));
  if (scope === "wrong") pool = words.filter((w) => (w.wrong || 0) > 0).sort((a, b) => (b.wrong - (b.correct || 0)) - (a.wrong - (a.correct || 0)));
  if (scope === "new") pool = words.filter((w) => !w.lastTestedAt);
  return shuffle(pool, rand).slice(0, count);
}

/**
 * 5지선다 문제 만들기.
 * direction: "w2m"(단어→뜻) | "m2w"(뜻→단어) | "mix"
 * @returns [{ id, prompt, sub, options: string[], answer: number }]
 */
export function buildChoiceQuestions(targets, all, direction = "w2m", rand = Math.random) {
  return targets.map((w) => {
    const dir = direction === "mix" ? (rand() < 0.5 ? "w2m" : "m2w") : direction;
    const field = dir === "w2m" ? "meaning" : "word";
    const correct = w[field];
    const seen = new Set([norm(correct)]);
    const distractors = [];
    for (const o of shuffle(all, rand)) {
      const v = o[field];
      if (!v || seen.has(norm(v))) continue;
      seen.add(norm(v));
      distractors.push(v);
      if (distractors.length === 4) break;
    }
    const options = shuffle([correct, ...distractors], rand);
    return {
      id: w.id,
      prompt: dir === "w2m" ? w.word : w.meaning,
      sub: dir === "w2m" ? [w.partOfSpeech, w.pronunciation].filter(Boolean).join(" · ") : w.partOfSpeech || "",
      speak: dir === "w2m" ? w.word : "",
      options,
      answer: options.indexOf(correct),
    };
  });
}

const norm = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** 빈칸 답 채점: AI가 준 활용형 또는 원형 모두 정답 */
export function checkBlank(input, answers) {
  const v = norm(input);
  return Boolean(v) && answers.some((a) => norm(a) === v);
}

/** 저장된 예문으로 빈칸 문제 만들기 (AI 실패 시 대체) */
export function localBlank(w) {
  const esc = w.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b(${esc}\\w*)`, "i");
  for (const e of w.examples || []) {
    const m = re.exec(e.sentence || "");
    if (m) return { id: w.id, sentence: e.sentence.replace(m[0], "_____"), answer: m[1], translation: e.translation || "" };
  }
  return null;
}
