// /words/ — 단어장 목록 (검색 · 정렬 · 발음 듣기 · 수정 · 삭제)

import { setupPage } from "../core/page.js";
import { listWords, deleteWord, dbErrorMessage } from "../core/db.js";
import { $, esc, icon, loadingHtml, messageHtml, exampleHtml, prefs, toast, renderError } from "../core/ui.js";
import { canSpeak, speak } from "../core/speech.js";

const PAGE_SIZE = 100;
const timeOf = (date) => (date instanceof Date ? date.getTime() : 0);

const SORTS = {
  recent: { label: "최근 추가순", compare: (a, b) => timeOf(b.createdAt) - timeOf(a.createdAt) },
  oldest: { label: "오래된순", compare: (a, b) => timeOf(a.createdAt) - timeOf(b.createdAt) },
  alpha: { label: "ABC순", compare: (a, b) => a.word.localeCompare(b.word, undefined, { sensitivity: "base" }) },
  wrong: { label: "많이 틀린순", compare: (a, b) => b.wrong - a.wrong || timeOf(b.createdAt) - timeOf(a.createdAt) },
};

function cardHtml(word) {
  const stats = word.correct || word.wrong
    ? `<span class="badge badge-ok">맞음 ${word.correct}</span><span class="badge badge-ng">틀림 ${word.wrong}</span>`
    : "";
  return `<article class="card word-card" data-id="${esc(word.id)}">
    <div class="word-head">
      <div>
        <h2 class="word-title">${esc(word.word)}</h2>
        <div class="word-sub">
          ${word.pronunciation ? `<span class="pron">${esc(word.pronunciation)}</span>` : ""}
          ${word.partOfSpeech ? `<span class="badge">${esc(word.partOfSpeech)}</span>` : ""}
          ${stats}
        </div>
      </div>
      <div class="word-actions">
        ${canSpeak ? `<button type="button" class="icon-btn" data-action="speak" aria-label="${esc(word.word)} 발음 듣기" title="발음 듣기">${icon("volume")}</button>` : ""}
        <a class="icon-btn" href="/words/edit/?id=${encodeURIComponent(word.id)}" aria-label="${esc(word.word)} 수정" title="수정">${icon("edit")}</a>
        <button type="button" class="icon-btn danger" data-action="delete" aria-label="${esc(word.word)} 삭제" title="삭제">${icon("trash")}</button>
      </div>
    </div>
    <p class="word-meaning">${esc(word.meaning)}</p>
    ${
      word.examples.length
        ? `<details class="word-examples"><summary>예문 ${word.examples.length}개</summary>${word.examples.map((example) => exampleHtml(example, word.word)).join("")}</details>`
        : ""
    }
    ${word.memo ? `<p class="word-memo">${esc(word.memo)}</p>` : ""}
  </article>`;
}

export default async function mountWords() {
  const { user, main } = await setupPage({ active: "words", title: "단어장" });
  main.innerHTML = loadingHtml("단어장을 불러오는 중…");

  let words;
  try {
    words = await listWords(user.uid);
  } catch (err) {
    renderError(main, "단어장을 불러오지 못했어요", dbErrorMessage(err));
    return;
  }

  const head = (count) => `
    <div class="page-head">
      <div><h1 class="page-title">단어장</h1><p class="page-desc">총 <strong data-total>${count}</strong>개</p></div>
      <a class="btn btn-primary" href="/words/add/">${icon("plus")}<span>단어 추가</span></a>
    </div>`;

  if (!words.length) {
    main.innerHTML = `${head(0)}${messageHtml({
      title: "아직 단어가 없어요",
      body: "단어를 추가하면 AI가 뜻과 예문을 채워 드려요.",
      actions: '<a class="btn btn-primary" href="/words/add/">첫 단어 추가하기</a>',
    })}`;
    return;
  }

  let sort = SORTS[prefs.get("words-sort")] ? prefs.get("words-sort") : "recent";
  let shown = PAGE_SIZE;

  main.innerHTML = `${head(words.length)}
    <div class="toolbar">
      <label class="search">${icon("search")}<input type="search" placeholder="단어·뜻·메모 검색" aria-label="단어 검색" enterkeyhint="search" /></label>
      <select aria-label="정렬 방식">${Object.entries(SORTS)
        .map(([value, item]) => `<option value="${value}"${value === sort ? " selected" : ""}>${item.label}</option>`)
        .join("")}</select>
    </div>
    <p class="count-line" aria-live="polite"></p>
    <div class="word-list"></div>
    <div class="actions" data-more hidden><button type="button" class="btn btn-block">더 보기</button></div>`;

  const list = $(".word-list", main);
  const search = $('input[type="search"]', main);
  const select = $("select", main);
  const countLine = $(".count-line", main);
  const more = $("[data-more]", main);

  function visibleWords() {
    const q = search.value.trim().toLowerCase();
    const matched = q
      ? words.filter((word) => [word.word, word.meaning, word.memo].some((text) => text.toLowerCase().includes(q)))
      : [...words];
    return matched.sort(SORTS[sort].compare);
  }

  function render() {
    const items = visibleWords();
    const q = search.value.trim();
    countLine.textContent = q ? `"${q}" 검색 결과 ${items.length}개` : "";
    if (items.length) {
      list.innerHTML = items.slice(0, shown).map(cardHtml).join("");
    } else if (q) {
      list.innerHTML = messageHtml({
        title: "검색 결과가 없어요",
        body: "다른 단어로 검색하거나 새 단어로 추가해 보세요.",
        actions: `<a class="btn btn-primary" href="/words/add/?word=${encodeURIComponent(q)}">'${esc(q)}' 추가하기</a>`,
      });
    } else {
      list.innerHTML = messageHtml({
        title: "단어장이 비었어요",
        actions: '<a class="btn btn-primary" href="/words/add/">단어 추가하기</a>',
      });
    }
    more.hidden = items.length <= shown;
    $("button", more).textContent = `더 보기 (${items.length - shown}개 남음)`;
  }

  let timer;
  search.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      shown = PAGE_SIZE;
      render();
    }, 120);
  });
  select.addEventListener("change", () => {
    sort = select.value;
    prefs.set("words-sort", sort);
    render();
  });
  $("button", more).addEventListener("click", () => {
    shown += PAGE_SIZE;
    render();
  });

  list.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const word = words.find((item) => item.id === button.closest("[data-id]")?.dataset.id);
    if (!word) return;

    if (button.dataset.action === "speak") {
      speak(word.word, word.language);
      return;
    }
    if (button.dataset.action === "delete") {
      if (!confirm(`'${word.word}'을(를) 삭제할까요?`)) return;
      button.disabled = true;
      try {
        await deleteWord(user.uid, word.id);
        words = words.filter((item) => item.id !== word.id);
        $("[data-total]", main).textContent = String(words.length);
        render();
        toast(`'${word.word}'을(를) 삭제했어요.`, "success");
      } catch (err) {
        button.disabled = false;
        toast(dbErrorMessage(err), "error");
      }
    }
  });

  render();
}
