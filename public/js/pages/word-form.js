// /words/add/ — 단어 추가(AI 뜻·예문: 한 단어 / 여러 단어), ?id=… 이면 수정
import { requireUser } from "../firebase.js";
import { listWords, getWord, addWord, saveWord, deleteWord } from "../store.js";
import { aiWords } from "../api.js";
import { start, $, esc, toast, busy, speak } from "../ui.js";

const exampleRow = (e = {}) => `
  <div class="example-row card" style="padding:10px">
    <input class="ex-s" placeholder="예문" value="${esc(e.sentence)}">
    <input class="ex-t" placeholder="번역" value="${esc(e.translation)}" style="margin-top:6px">
    <button class="link danger ex-del" type="button">예문 삭제</button>
  </div>`;

start(async () => {
  await requireUser();
  const id = new URLSearchParams(location.search).get("id");
  const editing = id ? await getWord(id) : null;
  if (id && !editing) throw new Error("단어를 찾을 수 없습니다.");
  const existing = await listWords();
  const has = (word) => existing.some((w) => w.word.toLowerCase() === word.toLowerCase() && w.id !== id);

  $("#app").innerHTML = `
    <h1>${editing ? "단어 수정" : "단어 추가"}</h1>
    ${editing ? "" : `<div class="tabs"><button type="button" data-tab="single" aria-pressed="true">한 단어</button><button type="button" data-tab="bulk" aria-pressed="false">여러 단어 한 번에</button></div>`}
    <form id="single" class="card">
      <label for="word">단어</label>
      <div class="row"><input id="word" required autocomplete="off" style="flex:1" placeholder="예: resilient">
        <button id="ai" type="button" class="primary">✨ AI 뜻·예문</button>
        <button id="say" type="button" aria-label="발음 듣기">🔊</button></div>
      <p id="dup" class="muted"></p>
      <label for="meaning">뜻</label><input id="meaning" required>
      <div class="row">
        <div style="flex:1"><label for="pos">품사</label><input id="pos"></div>
        <div style="flex:1"><label for="pron">발음</label><input id="pron"></div>
      </div>
      <label>예문</label><div id="examples"></div>
      <button id="addEx" type="button" class="link">+ 예문 추가</button>
      <label for="memo">메모</label><input id="memo">
      <div class="row" style="margin-top:16px">
        <button class="primary" type="submit">${editing ? "저장" : "단어장에 추가"}</button>
        ${editing ? '<button id="del" class="danger" type="button">삭제</button>' : ""}
        <a class="btn" href="/words/">목록으로</a>
      </div>
    </form>
    <section id="bulk" class="card" hidden>
      <label for="bulkText">단어 목록 (줄바꿈 또는 쉼표로 구분, 최대 20개)</label>
      <textarea id="bulkText" placeholder="abandon&#10;brief&#10;consistent"></textarea>
      <button id="bulkAi" class="primary" type="button" style="margin-top:10px">✨ AI로 한 번에 만들기</button>
      <div id="preview"></div>
    </section>`;

  // 한 단어
  const fill = (w) => {
    $("#word").value = w.word || "";
    $("#meaning").value = w.meaning || "";
    $("#pos").value = w.partOfSpeech || "";
    $("#pron").value = w.pronunciation || "";
    $("#memo").value = w.memo ?? $("#memo").value;
    $("#examples").innerHTML = (w.examples || []).map(exampleRow).join("");
    $("#word").dispatchEvent(new Event("input"));
  };
  const read = () => ({
    word: $("#word").value,
    meaning: $("#meaning").value,
    partOfSpeech: $("#pos").value,
    pronunciation: $("#pron").value,
    memo: $("#memo").value,
    examples: [...document.querySelectorAll(".example-row")].map((r) => ({ sentence: $(".ex-s", r).value.trim(), translation: $(".ex-t", r).value.trim() })),
  });

  $("#word").oninput = () => ($("#dup").textContent = has($("#word").value.trim()) ? "⚠️ 이미 단어장에 있는 단어입니다." : "");
  $("#say").onclick = () => speak($("#word").value);
  $("#addEx").onclick = () => $("#examples").insertAdjacentHTML("beforeend", exampleRow());
  $("#examples").onclick = (e) => e.target.classList.contains("ex-del") && e.target.closest(".example-row").remove();
  $("#ai").onclick = (e) => {
    const word = $("#word").value.trim();
    if (!word) return $("#word").focus();
    busy(e.target, "AI 생성 중…", async () => {
      try {
        const [item] = await aiWords([word]);
        if (!item) throw new Error("AI 결과가 없습니다.");
        fill({ ...item, memo: undefined });
        toast("AI가 뜻과 예문을 채웠어요. 확인 후 저장하세요.");
      } catch (err) {
        toast(err.message, "bad");
      }
    });
  };
  $("#single").onsubmit = (e) => {
    e.preventDefault();
    busy(e.submitter, "저장 중…", async () => {
      try {
        if (editing) {
          await saveWord(id, read());
          toast("저장했습니다.");
          location.href = "/words/";
        } else {
          const w = read();
          await addWord(w);
          existing.push({ ...w, id: "new" });
          fill({ memo: "" });
          $("#word").focus();
          toast(`"${w.word}" 추가 완료!`);
        }
      } catch (err) {
        toast(err.message, "bad");
      }
    });
  };
  if (editing) fill(editing);
  $("#del")?.addEventListener("click", async () => {
    if (!confirm(`"${editing.word}"을(를) 삭제할까요?`)) return;
    await deleteWord(id);
    location.href = "/words/";
  });

  // 탭
  document.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      $("#single").hidden = btn.dataset.tab !== "single";
      $("#bulk").hidden = btn.dataset.tab !== "bulk";
    };
  });

  // 여러 단어
  let items = [];
  $("#bulkAi")?.addEventListener("click", (e) => {
    const words = $("#bulkText").value.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    if (!words.length) return $("#bulkText").focus();
    if (words.length > 20) return toast("한 번에 20개까지 가능합니다.", "bad");
    busy(e.target, "AI 생성 중…", async () => {
      try {
        items = await aiWords(words);
        $("#preview").innerHTML = `
          <p class="muted">저장할 단어를 확인하세요. (이미 있는 단어는 체크 해제됨)</p>
          ${items.map((w, i) => `
            <label class="choice-card word-item"><input type="checkbox" data-i="${i}" ${has(w.word) ? "" : "checked"}>
              <b>${esc(w.word)}</b> <span class="muted">${esc(w.partOfSpeech)} ${esc(w.pronunciation)}</span> ${has(w.word) ? '<span class="muted">(이미 있음)</span>' : ""}
              <div style="font-weight:400">${esc(w.meaning)}</div>
              ${w.examples[0] ? `<small class="muted" style="font-weight:400">${esc(w.examples[0].sentence)}</small>` : ""}
            </label>`).join("")}
          <button id="bulkSave" class="primary" type="button">선택한 단어 저장</button>`;
      } catch (err) {
        toast(err.message, "bad");
      }
    });
  });
  $("#preview")?.addEventListener("click", (e) => {
    if (e.target.id !== "bulkSave") return;
    const chosen = [...document.querySelectorAll("#preview input:checked")].map((c) => items[c.dataset.i]);
    if (!chosen.length) return toast("선택한 단어가 없습니다.", "bad");
    busy(e.target, "저장 중…", async () => {
      try {
        for (const w of chosen) await addWord(w);
        toast(`${chosen.length}개 저장했습니다.`);
        location.href = "/words/";
      } catch (err) {
        toast(err.message, "bad");
      }
    });
  });
});
