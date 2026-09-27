// /test/blank/ — AI 빈칸 시험: AI가 새 예문을 만들고 빈칸에 들어갈 단어를 입력
import { requireUser } from "../firebase.js";
import { listWords } from "../store.js";
import { aiBlanks } from "../api.js";
import { pickWords, checkBlank, localBlank } from "../quiz.js";
import { showResult, readOptions, progress, emptyMessage } from "../result.js";
import { start, $, esc, speak, toast } from "../ui.js";

async function makeQuestions(targets) {
  let ai = [];
  try {
    ai = await aiBlanks(targets.map((w) => ({ id: w.id, word: w.word, meaning: w.meaning })));
  } catch (err) {
    toast(`AI 문제 생성 실패 — 저장된 예문으로 출제합니다. (${err.message})`, "bad");
  }
  const byId = new Map(ai.map((q) => [q.id, q]));
  return targets
    .map((w) => {
      const q = byId.get(w.id) || localBlank(w);
      return q && { ...q, word: w.word, meaning: w.meaning, ai: byId.has(w.id) };
    })
    .filter(Boolean);
}

start(async () => {
  await requireUser();
  const words = await listWords();
  const opts = readOptions();

  const run = async (targets) => {
    if (!targets.length) return emptyMessage(opts.scope);
    $("#app").innerHTML = `<section class="card" style="text-align:center"><p>✨ AI가 빈칸 문제를 만드는 중…</p></section>`;
    const questions = await makeQuestions(targets);
    if (!questions.length) {
      $("#app").innerHTML = `<section class="card"><h2>문제를 만들지 못했어요</h2><p class="muted">AI 연결을 확인하거나, 예문이 있는 단어로 다시 시도하세요.</p><a class="btn" href="/test/">시험 선택</a></section>`;
      return;
    }
    const answers = [];
    let i = 0;

    const show = () => {
      const q = questions[i];
      let hint = 0;
      $("#app").innerHTML = `
        ${progress(i, questions.length)}
        <section class="card">
          <p class="muted">${q.ai ? "✨ AI 예문" : "저장된 예문"}</p>
          <p class="sentence">${esc(q.sentence).replace("_____", '<b style="letter-spacing:2px">_____</b>')}</p>
          <p class="muted">${esc(q.translation)}</p>
          <form id="form" class="row">
            <input id="ans" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="빈칸에 들어갈 단어" style="flex:1" required>
            <button class="primary" type="submit">확인</button>
            <button id="hint" type="button">힌트</button>
          </form>
          <p id="hintText" class="muted"></p>
          <p id="fb" class="feedback"></p>
          <button id="next" class="primary" type="button" hidden>${i + 1 < questions.length ? "다음 →" : "결과 보기"}</button>
        </section>`;
      $("#ans").focus();
      $("#hint").onclick = () => {
        hint += 1;
        $("#hintText").textContent = hint === 1 ? `뜻: ${q.meaning}` : `뜻: ${q.meaning} · 첫 글자: ${q.answer[0]} (${q.answer.length}글자)`;
      };
      $("#form").onsubmit = (e) => {
        e.preventDefault();
        const ok = checkBlank($("#ans").value, [q.answer, q.word]);
        answers.push({ id: q.id, ok });
        $("#ans").disabled = true;
        $("#form").querySelectorAll("button").forEach((b) => (b.disabled = true));
        $("#fb").className = `feedback ${ok ? "ok" : "bad"}`;
        $("#fb").innerHTML = `${ok ? "정답!" : "오답"} — <b>${esc(q.answer)}</b> <span class="muted">(${esc(q.word)}: ${esc(q.meaning)})</span>
          <button class="link" type="button" id="say">🔊</button>`;
        $("#say").onclick = () => speak(q.sentence.replace("_____", q.answer));
        $("#next").hidden = false;
        $("#next").focus();
      };
      $("#next").onclick = () => {
        i += 1;
        if (i < questions.length) show();
        else showResult("blank", answers, words, run);
      };
    };
    show();
  };

  await run(pickWords(words, opts));
});
