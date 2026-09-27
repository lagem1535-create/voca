// / — 홈: 요약, 복습할 단어, 최근 시험
import { requireUser } from "../firebase.js";
import { listWords, listResults } from "../store.js";
import { start, $, esc } from "../ui.js";

start(async () => {
  const user = await requireUser();
  const [words, results] = await Promise.all([listWords(), listResults()]);
  const weak = words.filter((w) => (w.wrong || 0) > (w.correct || 0)).slice(0, 8);
  const untested = words.filter((w) => !w.lastTestedAt).length;
  const TYPE = { choice: "5지선다", blank: "AI 빈칸" };

  $("#app").innerHTML = `
    <h1>안녕하세요, ${esc(user.displayName || user.email)}</h1>
    <div class="grid">
      <a class="card stat" href="/words/"><b>${words.length}</b>저장한 단어</a>
      <a class="card stat" href="/test/?scope=new"><b>${untested}</b>아직 안 푼 단어</a>
      <a class="card stat" href="/test/?scope=wrong"><b>${words.filter((w) => w.wrong).length}</b>틀린 적 있는 단어</a>
    </div>
    <section class="card row">
      <a class="btn primary" href="/words/add/">+ 단어 추가 (AI)</a>
      <a class="btn" href="/test/choice/?n=10">5지선다 바로 시작</a>
      <a class="btn" href="/test/blank/?n=10">AI 빈칸 바로 시작</a>
    </section>
    <section class="card">
      <h2>복습이 필요한 단어</h2>
      ${weak.length ? weak.map((w) => `<div><b>${esc(w.word)}</b> <span class="muted">${esc(w.meaning)} · ✗${w.wrong || 0} ✓${w.correct || 0}</span></div>`).join("") : '<p class="muted">아직 없어요. 시험을 풀어 보세요!</p>'}
    </section>
    <section class="card">
      <h2>최근 시험</h2>
      ${results.length ? results.slice(0, 5).map((r) => `<div>${new Date(r.createdAt).toLocaleString("ko-KR")} · ${TYPE[r.type] || r.type} · <b>${r.correct}/${r.total}</b></div>`).join("") : '<p class="muted">시험 기록이 없어요.</p>'}
    </section>`;
});
