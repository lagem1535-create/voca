// /test/ — 시험 선택: 종류 · 범위 · 문제 수 · 방향
import { requireUser } from "../firebase.js";
import { listWords } from "../store.js";
import { start, $ } from "../ui.js";

start(async () => {
  await requireUser();
  const words = await listWords();
  const counts = {
    all: words.length,
    recent: Math.min(words.length, 20),
    wrong: words.filter((w) => w.wrong).length,
    new: words.filter((w) => !w.lastTestedAt).length,
  };
  const scope = new URLSearchParams(location.search).get("scope") || "all";
  const radio = (name, value, label, checked, extra = "") =>
    `<label class="choice-card card" style="margin:0"><input type="radio" name="${name}" value="${value}" ${checked ? "checked" : ""}>${label}${extra}</label>`;

  $("#app").innerHTML = `
    <h1>시험 선택</h1>
    <form id="form">
      <section class="card"><h2>시험 종류</h2><div class="grid">
        ${radio("type", "choice", "<b>5지선다</b>", true, '<div class="muted">보기 5개 중 정답 고르기</div>')}
        ${radio("type", "blank", "<b>✨ AI 빈칸</b>", false, '<div class="muted">AI가 만든 새 예문의 빈칸에 단어 쓰기</div>')}
      </div></section>
      <section class="card"><h2>범위</h2><div class="grid">
        ${radio("scope", "all", "전체", scope === "all", ` <span class="muted">${counts.all}</span>`)}
        ${radio("scope", "recent", "최근 추가", scope === "recent", ` <span class="muted">${counts.recent}</span>`)}
        ${radio("scope", "wrong", "틀린 적 있는 단어", scope === "wrong", ` <span class="muted">${counts.wrong}</span>`)}
        ${radio("scope", "new", "아직 안 푼 단어", scope === "new", ` <span class="muted">${counts.new}</span>`)}
      </div></section>
      <section class="card">
        <label for="n">문제 수</label>
        <select id="n">${[5, 10, 20, 30, 50].map((n) => `<option ${n === 10 ? "selected" : ""}>${n}</option>`).join("")}</select>
        <div id="dirBox"><label for="dir">방향 (5지선다)</label>
        <select id="dir"><option value="w2m">단어 → 뜻</option><option value="m2w">뜻 → 단어</option><option value="mix">섞어서</option></select></div>
      </section>
      <button class="primary" type="submit" style="width:100%">시작하기</button>
      <p id="msg" class="feedback bad"></p>
    </form>`;

  const form = $("#form");
  form.onchange = () => ($("#dirBox").hidden = form.type.value !== "choice");
  form.onsubmit = (e) => {
    e.preventDefault();
    if (!counts[form.scope.value]) return ($("#msg").textContent = "선택한 범위에 단어가 없습니다.");
    const q = new URLSearchParams({ n: $("#n").value, scope: form.scope.value });
    if (form.type.value === "choice") q.set("dir", $("#dir").value);
    location.href = `/test/${form.type.value}/?${q}`;
  };
});
