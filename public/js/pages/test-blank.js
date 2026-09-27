// /test/blank/ — AI 빈칸 시험 (?scope=all|recent|wrong|new &count=5|10|20|all)
// AI가 단어마다 새 예문을 만들고, 빈칸에 들어갈 단어를 직접 입력합니다.
// AI가 실패한 단어는 저장된 예문으로 대신 출제합니다.

import { setupPage } from "../core/page.js";
import { listWords, saveTestResult, dbErrorMessage } from "../core/db.js";
import { generateBlankQuestions } from "../core/api.js";
import {
  selectWords,
  gradeBlank,
  isNearMiss,
  blankFromExamples,
  letterHint,
  letterCount,
  scoreSummary,
  MAX_BLANK_QUESTIONS,
} from "../core/quiz.js";
import { progressHtml, resultHtml } from "../core/quiz-ui.js";
import { $, esc, icon, loadingHtml, messageHtml, renderError } from "../core/ui.js";
import { canSpeak, speak } from "../core/speech.js";

const AI_CHUNK = 10;

/** AI로 문제를 만들고, 실패한 단어는 저장된 예문으로 채웁니다. */
async function prepareQuestions(targets) {
  const chunks = [];
  for (let i = 0; i < targets.length; i += AI_CHUNK) chunks.push(targets.slice(i, i + AI_CHUNK));
  let aiError = null;
  const results = await Promise.all(
    chunks.map((chunk) =>
      generateBlankQuestions(chunk.map((word) => ({ id: word.id, word: word.word, meaning: word.meaning }))).catch((err) => {
        aiError ??= err;
        return { questions: [] };
      }),
    ),
  );
  const byId = new Map(results.flatMap((result) => result.questions || []).map((question) => [question.id, question]));
  const questions = [];
  let savedCount = 0;
  for (const word of targets) {
    const ai = byId.get(word.id);
    const question = ai ? { ...ai, source: "ai" } : blankFromExamples(word);
    if (!question) continue;
    if (!ai) savedCount += 1;
    questions.push({ ...question, target: word });
  }
  return { questions, aiError, savedCount };
}

export default async function mountBlankTest() {
  const { user, main } = await setupPage({ active: "test", title: "AI 빈칸 시험" });
  const params = new URLSearchParams(location.search);
  const scope = params.get("scope") || "all";
  const count = params.get("count") || "10";

  main.innerHTML = loadingHtml("단어를 불러오는 중…");
  let words;
  try {
    words = await listWords(user.uid);
  } catch (err) {
    renderError(main, "단어장을 불러오지 못했어요", dbErrorMessage(err));
    return;
  }
  const targets = selectWords(words, { scope, count, max: MAX_BLANK_QUESTIONS });
  if (!targets.length) {
    main.innerHTML = messageHtml({
      title: words.length ? "이 범위에 해당하는 단어가 없어요" : "시험 볼 단어가 없어요",
      actions: words.length ? '<a class="btn btn-primary" href="/test/">다른 범위 고르기</a>' : '<a class="btn btn-primary" href="/words/add/">단어 추가</a>',
    });
    return;
  }

  main.innerHTML = loadingHtml(`AI가 새 예문으로 빈칸 문제 ${targets.length}개를 만들고 있어요…`);
  const { questions, aiError, savedCount } = await prepareQuestions(targets);
  if (!questions.length) {
    renderError(
      main,
      "문제를 만들지 못했어요",
      aiError?.message || "AI 문제 생성에 실패했고, 대신 쓸 저장된 예문도 없어요.",
      '<a class="btn" href="/test/">시험 선택</a>',
    );
    return;
  }

  const notice = aiError
    ? `AI 문제 생성 중 오류가 있어 ${savedCount}문제는 저장된 예문으로 냈어요. (${aiError.message})`
    : savedCount
      ? `${savedCount}문제는 AI 대신 저장된 예문으로 냈어요.`
      : "";

  let state = null;

  function startRound(roundQuestions, roundNotice = "") {
    state = { questions: roundQuestions, index: 0, answers: [], answered: false, notice: roundNotice };
    showQuestion();
  }

  function showQuestion() {
    const { questions, index, answers } = state;
    const question = questions[index];
    const isLast = index + 1 >= questions.length;
    state.answered = false;

    main.innerHTML = `
      <div class="quiz">
        ${progressHtml({ index, total: questions.length, correct: answers.filter((answer) => answer.correct).length })}
        ${index === 0 && state.notice ? `<p class="notice">${esc(state.notice)}</p>` : ""}
        <section class="card quiz-card">
          <p class="quiz-label">
            빈칸에 들어갈 단어를 쓰세요
            ${question.source === "ai" ? `<span class="badge badge-ai">AI 예문</span>` : '<span class="badge">저장된 예문</span>'}
          </p>
          <p class="blank-sentence">${esc(question.before)}<span class="blank" role="img" aria-label="빈칸"></span>${esc(question.after)}</p>
          ${question.translation ? `<p class="blank-translation">${esc(question.translation)}</p>` : ""}
          <div class="hints">
            <button type="button" class="btn btn-sm" data-hint="meaning">뜻 힌트</button>
            <button type="button" class="btn btn-sm" data-hint="letter">첫 글자 힌트</button>
            <span class="hint-chip" data-hint-text="meaning" hidden>${esc(question.target.meaning)}</span>
            <span class="hint-chip" data-hint-text="letter" hidden>${esc(letterHint(question.answer))} (${letterCount(question.answer)}글자)</span>
          </div>
          <form class="answer-form" autocomplete="off">
            <input type="text" name="answer" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="done"
              placeholder="정답 입력" aria-label="빈칸에 들어갈 단어" />
            <button type="submit" class="btn btn-primary">확인</button>
            <button type="button" class="btn btn-ghost" data-action="giveup">모르겠어요</button>
          </form>
          <div class="feedback" aria-live="polite" hidden></div>
        </section>
        <div class="quiz-actions">
          <button type="button" class="btn btn-ghost" data-action="quit">그만하기</button>
          <button type="button" class="btn btn-primary" data-action="next" hidden><span>${isLast ? "결과 보기" : "다음 문제"}</span>${icon("arrow")}</button>
        </div>
      </div>`;

    const form = $(".answer-form", main);
    const input = form.elements.namedItem("answer");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (state.answered) {
        goNext();
        return;
      }
      if (!input.value.trim()) {
        input.focus();
        return;
      }
      complete(input.value);
    });
    input.focus({ preventScroll: true });
  }

  function complete(value) {
    const question = state.questions[state.index];
    const correct = gradeBlank(value, question);
    state.answered = true;
    state.answers.push({ id: question.target.id, correct, question });

    const form = $(".answer-form", main);
    const input = form.elements.namedItem("answer");
    input.readOnly = true;
    if (value) input.classList.add(correct ? "is-correct" : "is-wrong");
    form.querySelectorAll("button").forEach((button) => (button.disabled = true));
    main.querySelectorAll("[data-hint]").forEach((button) => (button.disabled = true));

    const title = correct ? "정답이에요!" : value && isNearMiss(value, question) ? "아까워요! 철자를 확인해 보세요." : "아쉬워요!";
    const base = question.answer.toLowerCase() !== question.word.toLowerCase() ? ` <span class="muted">(원형: ${esc(question.word)})</span>` : "";
    const feedback = $(".feedback", main);
    feedback.className = `feedback ${correct ? "is-correct" : "is-wrong"}`;
    feedback.innerHTML = `
      <p class="feedback-title">${title}</p>
      <p>정답: <strong>${esc(question.answer)}</strong>${base} — ${esc(question.target.meaning)}</p>
      <div class="example">
        <p class="example-sentence">${esc(question.before)}<mark>${esc(question.answer)}</mark>${esc(question.after)}
          ${canSpeak ? `<button type="button" class="icon-btn" data-action="speak" aria-label="예문 듣기" title="예문 듣기">${icon("volume")}</button>` : ""}
        </p>
        ${question.translation ? `<p class="example-translation">${esc(question.translation)}</p>` : ""}
      </div>`;
    feedback.hidden = false;
    $(".quiz-score", main).textContent = `정답 ${state.answers.filter((answer) => answer.correct).length}`;

    const next = $('[data-action="next"]', main);
    next.hidden = false;
    next.focus({ preventScroll: true });
    feedback.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function goNext() {
    state.index += 1;
    if (state.index < state.questions.length) showQuestion();
    else finish();
  }

  function finish() {
    const { answers } = state;
    if (!answers.length) {
      location.href = "/test/";
      return;
    }
    state = null;
    const wrong = answers.filter((answer) => !answer.correct);
    const wrongWords = wrong.map((answer) => answer.question.target);
    main.innerHTML = resultHtml({ title: "AI 빈칸", answers, wrongWords });
    window.scrollTo({ top: 0 });
    $('[data-action="retry-wrong"]', main)?.addEventListener("click", () => startRound(wrong.map((answer) => answer.question)));

    const status = $(".save-status", main);
    const { total, correct } = scoreSummary(answers);
    saveTestResult(
      user.uid,
      {
        type: "blank",
        scope,
        total,
        correct,
        wrong: wrongWords.slice(0, 50).map((word) => ({ id: word.id, word: word.word, meaning: word.meaning })),
      },
      answers.map((answer) => ({ id: answer.id, correct: answer.correct })),
    )
      .then(() => {
        status.textContent = "결과를 저장했어요.";
      })
      .catch((err) => {
        status.textContent = `결과를 저장하지 못했어요: ${dbErrorMessage(err)}`;
        status.classList.add("is-error");
      });
  }

  main.addEventListener("click", (event) => {
    const hint = event.target.closest("[data-hint]");
    if (hint) {
      $(`[data-hint-text="${hint.dataset.hint}"]`, main).hidden = false;
      hint.hidden = true;
      main.querySelector(".answer-form input")?.focus({ preventScroll: true });
      return;
    }
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!state && action !== "retry-wrong") return;
    if (action === "giveup" && !state.answered) complete("");
    else if (action === "next") goNext();
    else if (action === "speak") {
      const question = state.questions[state.index];
      speak(`${question.before}${question.answer}${question.after}`, question.target.language);
    } else if (action === "quit") {
      if (!state.answers.length) location.href = "/test/";
      else if (confirm("시험을 그만할까요? 지금까지 푼 문제로 결과를 보여 드려요.")) finish();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (!state?.answered || event.isComposing) return;
    if (event.key === "Enter" && !event.target.closest?.("input, textarea")) {
      event.preventDefault();
      goNext();
    }
  });

  startRound(questions, notice);
}
