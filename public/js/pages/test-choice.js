// /test/choice/ — 5지선다 시험 (?scope=all|recent|wrong|new &count=5|10|20|all &dir=w2m|m2w|mix)

import { setupPage } from "../core/page.js";
import { listWords, saveTestResult, dbErrorMessage } from "../core/db.js";
import { buildChoiceQuestions, canBuildChoice, selectWords, scoreSummary, OPTION_COUNT } from "../core/quiz.js";
import { progressHtml, resultHtml } from "../core/quiz-ui.js";
import { $, $$, esc, icon, loadingHtml, messageHtml, exampleHtml, renderError } from "../core/ui.js";
import { canSpeak, speak } from "../core/speech.js";

export default async function mountChoiceTest() {
  const { user, main } = await setupPage({ active: "test", title: "5지선다 시험" });
  const params = new URLSearchParams(location.search);
  const scope = params.get("scope") || "all";
  const count = params.get("count") || "10";
  const direction = ["w2m", "m2w", "mix"].includes(params.get("dir")) ? params.get("dir") : "w2m";

  main.innerHTML = loadingHtml("문제를 준비하는 중…");
  let words;
  try {
    words = await listWords(user.uid);
  } catch (err) {
    renderError(main, "단어장을 불러오지 못했어요", dbErrorMessage(err));
    return;
  }

  if (!canBuildChoice(words)) {
    main.innerHTML = messageHtml({
      title: "단어가 조금 더 필요해요",
      body: `5지선다는 뜻이 서로 다른 단어가 ${OPTION_COUNT}개 이상 있어야 해요. (지금 ${words.length}개)`,
      actions: '<a class="btn btn-primary" href="/words/add/">단어 추가</a><a class="btn" href="/test/">시험 선택</a>',
    });
    return;
  }
  const targets = selectWords(words, { scope, count });
  if (!targets.length) {
    main.innerHTML = messageHtml({
      title: "이 범위에 해당하는 단어가 없어요",
      actions: '<a class="btn btn-primary" href="/test/">다른 범위 고르기</a>',
    });
    return;
  }

  let state = null;

  function startRound(roundTargets) {
    const questions = buildChoiceQuestions(roundTargets, words, { direction });
    if (!questions.length) {
      state = null;
      main.innerHTML = messageHtml({
        title: "보기를 만들 수 없어요",
        body: "뜻이 서로 다른 단어가 더 필요해요.",
        actions: '<a class="btn btn-primary" href="/test/">시험 선택</a>',
      });
      return;
    }
    state = { questions, index: 0, answers: [], answered: false };
    showQuestion();
  }

  function showQuestion() {
    const { questions, index, answers } = state;
    const question = questions[index];
    const word = question.word;
    const isLast = index + 1 >= questions.length;
    state.answered = false;

    const info = question.mode === "w2m"
      ? [word.pronunciation, word.partOfSpeech].filter(Boolean).map(esc).join(" · ")
      : esc(word.partOfSpeech);

    main.innerHTML = `
      <div class="quiz">
        ${progressHtml({ index, total: questions.length, correct: answers.filter((answer) => answer.correct).length })}
        <section class="card quiz-card">
          <p class="quiz-label">${question.mode === "w2m" ? "알맞은 뜻을 고르세요" : "알맞은 단어를 고르세요"}</p>
          <h1 class="quiz-prompt${question.mode === "m2w" ? " is-meaning" : ""}">
            <span>${esc(question.prompt)}</span>
            ${question.mode === "w2m" && canSpeak ? `<button type="button" class="icon-btn" data-action="speak" aria-label="발음 듣기" title="발음 듣기">${icon("volume")}</button>` : ""}
          </h1>
          ${info ? `<p class="quiz-sub">${info}</p>` : ""}
          <ol class="options">
            ${question.options
              .map(
                (option, i) => `<li><button type="button" class="option" data-index="${i}">
                  <span class="option-key">${i + 1}</span><span>${esc(option.text)}</span>
                </button></li>`,
              )
              .join("")}
          </ol>
          <div class="feedback" aria-live="polite" hidden></div>
        </section>
        <div class="quiz-actions">
          <button type="button" class="btn btn-ghost" data-action="quit">그만하기</button>
          <button type="button" class="btn btn-primary" data-action="next" hidden><span>${isLast ? "결과 보기" : "다음 문제"}</span>${icon("arrow")}</button>
        </div>
        <p class="kbd-hint">키보드: 1~5 선택 · Enter 다음</p>
      </div>`;
  }

  function choose(choice) {
    if (!state || state.answered) return;
    state.answered = true;
    const question = state.questions[state.index];
    const correct = choice === question.answerIndex;
    state.answers.push({ id: question.word.id, correct, word: question.word });

    $$(".option", main).forEach((button, i) => {
      button.disabled = true;
      if (i === question.answerIndex) button.classList.add("is-correct");
      else if (i === choice) button.classList.add("is-wrong");
    });

    const word = question.word;
    const example = word.examples?.[0];
    const feedback = $(".feedback", main);
    feedback.className = `feedback ${correct ? "is-correct" : "is-wrong"}`;
    feedback.innerHTML = `
      <p class="feedback-title">${correct ? "정답이에요!" : "아쉬워요!"}</p>
      <p><strong>${esc(word.word)}</strong>${word.pronunciation ? ` <span class="pron muted">${esc(word.pronunciation)}</span>` : ""} — ${esc(word.meaning)}</p>
      ${example ? exampleHtml(example, word.word) : ""}`;
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
    const wrongWords = answers.filter((answer) => !answer.correct).map((answer) => answer.word);
    main.innerHTML = resultHtml({ title: "5지선다", answers, wrongWords });
    window.scrollTo({ top: 0 });
    $('[data-action="retry-wrong"]', main)?.addEventListener("click", () => startRound(wrongWords));

    const status = $(".save-status", main);
    const { total, correct } = scoreSummary(answers);
    saveTestResult(
      user.uid,
      {
        type: "choice",
        direction,
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
    const option = event.target.closest(".option");
    if (option) {
      choose(Number(option.dataset.index));
      return;
    }
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "next") goNext();
    else if (action === "speak" && state) {
      const word = state.questions[state.index].word;
      speak(word.word, word.language);
    } else if (action === "quit" && state) {
      if (!state.answers.length) location.href = "/test/";
      else if (confirm("시험을 그만할까요? 지금까지 푼 문제로 결과를 보여 드려요.")) finish();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (!state || event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
    if (/^[1-9]$/.test(event.key) && !state.answered) {
      const option = $(`.option[data-index="${Number(event.key) - 1}"]`, main);
      if (option) {
        event.preventDefault();
        option.click();
      }
    } else if ((event.key === "Enter" || event.key === "ArrowRight") && state.answered) {
      event.preventDefault();
      goNext();
    }
  });

  startRound(targets);
}
