// /test/blank?scope=&count= — AI 빈칸 시험
// AI 가 매번 새 예문을 만들어 단어 자리를 빈칸으로 비웁니다. AI 가 실패하면 저장된 예문으로 출제합니다.
import { h, icon, toast, speakButton } from "../ui.js";
import { loadWords, recordAnswer, saveResult } from "../store.js";
import { readTestSettings, pickTargets, fallbackBlank, MAX_BLANK_QUESTIONS } from "../quiz.js";
import { aiBlank } from "../api.js";
import { BLANK, checkAnswer, normalizeAnswer } from "../shared/text.js";
import { quizHeader, resultView, cannotStart } from "../components/quiz-ui.js";

const SOURCE_LABEL = {
  ai: "AI 예문의 빈칸을 채우세요",
  example: "저장된 예문의 빈칸을 채우세요",
  meaning: "뜻을 보고 단어를 쓰세요",
};

function blankSentence(sentence, slot, lang) {
  const [before, ...after] = sentence.split(BLANK);
  return h("p", { class: "blank-sentence", lang }, before, slot, after.join(BLANK));
}

export default async function mount(root, { query, signal }) {
  root.append(h("div", { class: "loading", role: "status" }, h("span", { class: "spinner" }), "문제를 준비하는 중…"));
  let words = await loadWords();
  if (signal.aborted) return;
  const settings = readTestSettings(query);
  const count = settings.count > 0 ? Math.min(settings.count, MAX_BLANK_QUESTIONS) : MAX_BLANK_QUESTIONS;

  async function prepare(targets) {
    if (!targets.length) {
      root.replaceChildren(cannotStart(null, settings.scope));
      return;
    }
    root.replaceChildren(
      h(
        "section",
        { class: "card center stack-sm ai-wait", role: "status" },
        h("span", { class: "spinner lg" }),
        h("p", {}, `AI 가 새 예문으로 빈칸 문제 ${targets.length}개를 만들고 있어요…`),
        h("p", { class: "muted small" }, "보통 5~20초 걸려요."),
      ),
    );

    let made = new Map();
    let aiError = null;
    try {
      const { items } = await aiBlank(targets.map((w) => ({ id: w.id, word: w.word, meaning: w.meaning, pos: w.pos })));
      made = new Map(items.map((it) => [it.id, it]));
    } catch (err) {
      aiError = err;
    }
    if (signal.aborted) return;

    const questions = targets.map((w) =>
      made.has(w.id) ? { word: w, ...made.get(w.id), source: "ai" } : { word: w, ...fallbackBlank(w) },
    );
    if (aiError) {
      root.replaceChildren(
        h(
          "div",
          { class: "stack" },
          h("div", { class: "alert error", role: "alert" }, `AI 문제를 만들지 못했어요: ${aiError.message}`),
          h(
            "div",
            { class: "btn-row" },
            h("button", { type: "button", class: "btn primary", onclick: () => prepare(targets) }, icon("refresh", 18), "다시 시도"),
            h("button", { type: "button", class: "btn", onclick: () => run(questions) }, "AI 없이 저장된 예문으로 보기"),
          ),
        ),
      );
      return;
    }
    run(questions);
  }

  function run(questions) {
    const total = questions.length;
    let index = 0;
    let score = 0;
    const wrong = [];

    function show() {
      const q = questions[index];
      const w = q.word;
      let answered = false;
      let nearWarned = false;

      const slot = h("span", { class: "blank-slot" }, h("span", { class: "sr-only" }, "빈칸"));
      const input = h("input", {
        class: "input input-lg",
        autocomplete: "off",
        autocapitalize: "off",
        autocorrect: "off",
        spellcheck: "false",
        enterkeyhint: "done",
        placeholder: q.sentence ? "빈칸에 들어갈 단어" : "단어를 쓰세요",
        "aria-label": "정답 입력",
        lang: w.lang,
      });
      const checkBtn = h("button", { type: "submit", class: "btn primary" }, "확인");
      const hintBtn = h("button", { type: "button", class: "btn ghost small" }, icon("bulb", 16), "힌트");
      const giveUpBtn = h("button", { type: "button", class: "btn ghost small" }, "모르겠어요");
      const hint = h("p", { class: "hint", hidden: true });
      const nearMiss = h("p", { class: "near-miss", role: "status", hidden: true });
      const feedback = h("div", { class: "feedback-area" });
      const form = h("form", { class: "answer-form", novalidate: true }, input, checkBtn);

      root.replaceChildren(
        quizHeader(index, total, score),
        h(
          "section",
          { class: "card quiz-card stack-sm" },
          h("p", { class: "quiz-label center" }, SOURCE_LABEL[q.source]),
          q.sentence
            ? blankSentence(q.sentence, slot, w.lang)
            : h("p", { class: "quiz-prompt is-meaning center" }, w.meaning),
          q.sentence && q.translation ? h("p", { class: "blank-translation" }, q.translation) : null,
          !q.sentence && w.pos ? h("p", { class: "muted center" }, w.pos) : null,
          hint,
        ),
        form,
        nearMiss,
        h("div", { class: "btn-row center" }, hintBtn, giveUpBtn),
        feedback,
      );
      input.focus({ preventScroll: true });

      hintBtn.addEventListener("click", () => {
        const answer = q.answer || w.word;
        hint.textContent = `첫 글자 '${answer[0]}' · ${[...answer].length}글자${q.sentence ? ` · 뜻: ${w.meaning}` : ""}`;
        hint.hidden = false;
        hintBtn.disabled = true;
        input.focus();
      });
      giveUpBtn.addEventListener("click", () => grade(""));
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!input.value.trim()) {
          input.focus();
          return;
        }
        grade(input.value);
      });

      function grade(value) {
        if (answered) return;
        const res = value ? checkAnswer(value, { answer: q.answer, word: w.word }) : { correct: false };
        if (!res.correct && res.near && !nearWarned) {
          nearWarned = true;
          nearMiss.textContent = "아까워요! 철자를 한 번 더 확인해 보세요.";
          nearMiss.hidden = false;
          input.select();
          return;
        }
        answered = true;
        nearMiss.hidden = true;
        for (const el of [input, checkBtn, hintBtn, giveUpBtn]) el.disabled = true;
        if (res.correct) score++;
        else wrong.push(w);
        recordAnswer(w.id, res.correct).catch((err) => toast(err.message, "error"));

        slot.replaceChildren(q.answer);
        slot.classList.add(res.correct ? "good" : "bad");
        const full = q.sentence ? q.sentence.replace(BLANK, () => q.answer) : null;
        const baseDiffers = normalizeAnswer(q.answer) !== normalizeAnswer(w.word);
        const nextBtn = h("button", { type: "button", class: "btn primary block", onclick: next }, index === total - 1 ? "결과 보기" : "다음 문제", icon("arrow", 18));
        feedback.replaceChildren(
          h(
            "div",
            { class: `feedback ${res.correct ? "good" : "bad"}`, role: "status" },
            h("strong", { class: "feedback-title" }, res.correct ? "정답이에요!" : value ? "오답이에요" : "정답을 확인하세요"),
            res.correct && !res.exact ? h("p", {}, `이 문장에서는 '${q.answer}' 형태로 써요.`) : null,
            !res.correct
              ? h("p", {}, "정답: ", h("strong", { lang: w.lang }, q.answer), baseDiffers ? ` (기본형 ${w.word})` : "", value ? ` · 내 답: ${value.trim()}` : "")
              : null,
            full ? h("p", { class: "example-line" }, h("span", { lang: w.lang }, full), speakButton(full, w.lang, "문장 듣기")) : null,
            h("p", { class: "muted" }, `${w.word} — ${w.meaning}`),
          ),
          nextBtn,
        );
        nextBtn.focus({ preventScroll: true });
        nextBtn.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }

    function next() {
      index += 1;
      if (index < total) show();
      else finish();
    }

    function finish() {
      saveResult({ type: "blank", scope: settings.scope, total, correct: score, wrong }).catch((err) => toast(err.message, "error"));
      root.replaceChildren(
        resultView({
          title: "AI 빈칸 결과",
          total,
          correct: score,
          wrongWords: wrong,
          onRetryWrong: () => prepare(wrong),
          onRetryAll: async () => {
            words = await loadWords();
            prepare(pickTargets(words, { ...settings, count }));
          },
        }),
      );
      window.scrollTo(0, 0);
    }

    show();
  }

  prepare(pickTargets(words, { ...settings, count }));
}
