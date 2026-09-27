// /words/ — 단어장: 검색, 발음, 수정, 삭제
import { requireUser } from "../firebase.js";
import { listWords, deleteWord } from "../store.js";
import { start, $, esc, speak, toast } from "../ui.js";

start(async () => {
  await requireUser();
  let words = await listWords();

  $("#app").innerHTML = `
    <div class="row" style="justify-content:space-between"><h1>단어장 <span class="muted" id="count"></span></h1>
      <a class="btn primary" href="/words/add/">+ 단어 추가</a></div>
    <div class="row" style="margin-bottom:12px">
      <input id="q" type="search" placeholder="단어·뜻 검색" style="flex:1">
      <select id="sort" style="width:auto">
        <option value="new">최근 추가순</option><option value="abc">알파벳순</option><option value="wrong">많이 틀린 순</option>
      </select>
    </div>
    <section class="card" id="list"></section>`;

  const render = () => {
    const q = $("#q").value.trim().toLowerCase();
    const sort = $("#sort").value;
    let list = words.filter((w) => !q || `${w.word} ${w.meaning}`.toLowerCase().includes(q));
    if (sort === "abc") list = [...list].sort((a, b) => a.word.localeCompare(b.word));
    if (sort === "wrong") list = [...list].sort((a, b) => (b.wrong || 0) - (a.wrong || 0));
    $("#count").textContent = `${list.length}개`;
    $("#list").innerHTML = list.length
      ? list.map((w) => `
        <div class="word-item" data-id="${esc(w.id)}">
          <div class="head">
            <span class="w">${esc(w.word)}</span>
            <span class="muted">${esc([w.partOfSpeech, w.pronunciation].filter(Boolean).join(" · "))}</span>
            <button class="link" data-act="speak" type="button" aria-label="발음 듣기">🔊</button>
            <span style="flex:1"></span>
            <span class="muted">✓${w.correct || 0} ✗${w.wrong || 0}</span>
            <a class="link" href="/words/add/?id=${encodeURIComponent(w.id)}">수정</a>
            <button class="link danger" data-act="delete" type="button">삭제</button>
          </div>
          <div>${esc(w.meaning)}</div>
          ${w.examples.length ? `<details><summary class="muted">예문 ${w.examples.length}개</summary>
            ${w.examples.map((e) => `<p class="example">${esc(e.sentence)}<small>${esc(e.translation)}</small></p>`).join("")}</details>` : ""}
          ${w.memo ? `<div class="muted">📝 ${esc(w.memo)}</div>` : ""}
        </div>`).join("")
      : `<p class="muted">${words.length ? "검색 결과가 없어요." : '아직 단어가 없어요. <a href="/words/add/">단어를 추가</a>해 보세요.'}</p>`;
  };

  $("#q").oninput = render;
  $("#sort").onchange = render;
  $("#list").onclick = async (e) => {
    const act = e.target.dataset.act;
    const id = e.target.closest(".word-item")?.dataset.id;
    const w = words.find((x) => x.id === id);
    if (!act || !w) return;
    if (act === "speak") speak(w.word);
    if (act === "delete" && confirm(`"${w.word}"을(를) 삭제할까요?`)) {
      await deleteWord(id);
      words = words.filter((x) => x.id !== id);
      render();
      toast("삭제했습니다.");
    }
  };
  render();
});
