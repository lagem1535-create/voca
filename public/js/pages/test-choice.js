// /test/choice/ — 5지선다 시험 (키보드 1~5, Enter=다음)
import { requireUser } from "../firebase.js";
import { listWords } from "../store.js";
import { pickWords, buildChoiceQuestions } from "../quiz.js";
import { showResult, readOptions, progress, emptyMessage } from "../result.js";
import { start, $, esc, speak } from "../ui.js";

start(async () => {
  await requireUser();
  const words = await listWords();
  const opts = readOptions();
  if (words.length < 2) return emptyMessage("all");

  const run = (targets) => {
    if (!targets.length) return emptyMessage(opts.scope);
    const questions = buildChoiceQuestions(targets, words, opts.direction);
    const answers = [];
    let i = 0;
    let answered = false;

    const show = () => {
      const q = questions[i];
      answered = false;
      $("#app").innerHTML = `
        ${progress(i, questions.length)}
        <section class="card">
          <div class="question">${esc(q.prompt)} ${q.speak ? '<button id="say" class="link" type="button" aria-label="발음 듣기">🔊</button>' : ""}</div>
          <p class="muted" style="text-align:center">${esc(q.sub)}</p>
          <div class="options">${q.options.map((o, k) => `<button type="button" data-k="${k}">${k + 1}. ${esc(o)}</button>`).join("")}</div>
          <p id="fb" class="feedback"></p>
          <button id="next" class="primary" type="button" hidden>${i + 1 < questions.length ? "다음 →" : "결과 보기"}</button>
        </section>`;
      $("#say")?.addEventListener("click", () => speak(q.speak));
      $(".options").onclick = (e) => e.target.dataset.k && choose(Number(e.target.dataset.k));
      $("#next").onclick = next;
    };

    const choose = (k) => {
      if (answered) return;
      const q = questions[i];
      if (k >= q.options.length) return;
      answered = true;
      const ok = k === q.answer;
      answers.push({ id: q.id, ok });
      const buttons = document.querySelectorAll(".options button");
      buttons.forEach((b) => (b.disabled = true));
      buttons[q.answer].classList.add("ok");
      if (!ok) buttons[k].classList.add("bad");
      $("#fb").className = `feedback ${ok ? "ok" : "bad"}`;
      $("#fb").textContent = ok ? "정답!" : `오답 — 정답: ${q.options[q.answer]}`;
      $("#next").hidden = false;
      $("#next").focus();
    };

    const next = () => {
      i += 1;
      if (i < questions.length) show();
      else {
        document.onkeydown = null;
        showResult("choice", answers, words, run);
      }
    };

    document.onkeydown = (e) => {
      if (/^[1-5]$/.test(e.key)) choose(Number(e.key) - 1);
      else if (e.key === "Enter" && answered && document.activeElement?.id !== "next") next();
    };
    show();
  };

  run(pickWords(words, opts));
});
