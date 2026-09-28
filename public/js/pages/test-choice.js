// /test/choice?scope=&count=&dir= — 5지선다 시험 (키보드 1~5 선택, Enter 다음)
import { h, icon, loading, toast, speakButton } from "../ui.js";
import { loadWords, recordAnswer, saveResult } from "../store.js";
import { readTestSettings, pickTargets, buildChoiceQuestions, canBuildChoice } from "../quiz.js";
import { quizHeader, resultView, cannotStart, isTypingTarget } from "../components/quiz-ui.js";

export default async function mount(root, { query, signal }) {
  root.append(loading("문제를 준비하는 중…"));
  let words = await loadWords();
  if (signal.aborted) return;
  const settings = readTestSettings(query);
  let current = null;

  function start(targets) {
    current?.abort();
    const ctl = new AbortController();
    current = ctl;
    signal.addEventListener("abort", () => ctl.abort(), { once: true });

    if (!canBuildChoice(words)) {
      root.replaceChildren(cannotStart("5지선다는 뜻이 서로 다른 단어가 5개 이상 있어야 해요.", settings.scope));
      return;
    }
    const questions = buildChoiceQuestions(targets, words, settings.dir);
    if (!questions.length) {
      root.replaceChildren(cannotStart(null, settings.scope));
      return;
    }

    const total = questions.length;
    let index = 0;
    let score = 0;
    let answered = false;
    let options = [];
    const wrong = [];

    document.addEventListener(
      "keydown",
      (e) => {
        if (answered || isTypingTarget(e) || e.metaKey || e.ctrlKey || e.altKey) return;
        if (/^[1-5]$/.test(e.key)) {
          e.preventDefault();
          choose(Number(e.key) - 1);
        }
      },
      { signal: ctl.signal },
    );

    function show() {
      answered = false;
      const q = questions[index];
      const w = q.word;
      options = q.options.map((opt, i) =>
        h(
          "button",
          { type: "button", class: "option", onclick: () => choose(i) },
          h("span", { class: "option-num" }, String(i + 1)),
          h("span", { class: "option-text", lang: q.mode === "m2w" ? w.lang : null }, opt.text),
        ),
      );
      // 뜻→단어 문제에서는 발음이 답을 알려주므로 품사만 보여줍니다.
      const sub = q.mode === "w2m" ? [w.pos, w.pronunciation].filter(Boolean).join(" · ") : w.pos;
      root.replaceChildren(
        quizHeader(index, total, score),
        h(
          "section",
          { class: "card quiz-card center stack-sm" },
          h("p", { class: "quiz-label" }, q.mode === "w2m" ? "이 단어의 뜻은?" : "이 뜻을 가진 단어는?"),
          h(
            "div",
            { class: "quiz-prompt-row" },
            h("p", { class: `quiz-prompt${q.mode === "m2w" ? " is-meaning" : ""}`, lang: q.mode === "w2m" ? w.lang : null }, q.prompt),
            q.mode === "w2m" ? speakButton(w.word, w.lang) : null,
          ),
          sub ? h("p", { class: "muted" }, sub) : null,
        ),
        h("div", { class: "options", role: "group", "aria-label": "보기 (키보드 1~5)" }, options),
        h("div", { class: "feedback-area" }),
      );
    }

    function choose(i) {
      if (answered || !options[i]) return;
      answered = true;
      const q = questions[index];
      const w = q.word;
      const ok = i === q.answer;
      options.forEach((b, j) => {
        b.disabled = true;
        b.classList.add(j === q.answer ? "correct" : j === i ? "wrong" : "dim");
      });
      if (ok) score++;
      else wrong.push(w);
      recordAnswer(w.id, ok).catch((err) => toast(err.message, "error"));

      const ex = w.examples[0];
      const nextBtn = h("button", { type: "button", class: "btn primary block", onclick: next }, index === total - 1 ? "결과 보기" : "다음 문제", icon("arrow", 18));
      root.querySelector(".feedback-area").replaceChildren(
        h(
          "div",
          { class: `feedback ${ok ? "good" : "bad"}`, role: "status" },
          h("strong", { class: "feedback-title" }, ok ? "정답이에요!" : "아쉬워요, 오답이에요"),
          h(
            "div",
            { class: "word-line" },
            h("span", { class: "word-text", lang: w.lang }, w.word),
            w.pronunciation ? h("span", { class: "word-pron" }, w.pronunciation) : null,
            w.pos ? h("span", { class: "tag" }, w.pos) : null,
            speakButton(w.word, w.lang),
          ),
          h("p", {}, w.meaning),
          ex ? h("p", { class: "example" }, h("span", { lang: w.lang }, ex.sentence), ex.translation ? h("span", { class: "muted" }, ex.translation) : null) : null,
        ),
        nextBtn,
      );
      nextBtn.focus({ preventScroll: true });
      nextBtn.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    function next() {
      index += 1;
      if (index < total) show();
      else finish();
    }

    function finish() {
      ctl.abort();
      saveResult({ type: "choice", scope: settings.scope, dir: settings.dir, total, correct: score, wrong }).catch((err) =>
        toast(err.message, "error"),
      );
      root.replaceChildren(
        resultView({
          title: "5지선다 결과",
          total,
          correct: score,
          wrongWords: wrong,
          onRetryWrong: () => start(wrong),
          onRetryAll: async () => {
            words = await loadWords();
            start(pickTargets(words, settings));
          },
        }),
      );
      window.scrollTo(0, 0);
    }

    show();
  }

  start(pickTargets(words, settings));
}
