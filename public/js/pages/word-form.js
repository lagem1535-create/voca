// /words/add/  — 단어 추가 (한 단어씩 / 여러 단어 한 번에) + AI 뜻·예문 생성
// /words/edit/ — 단어 수정·삭제 (?id=문서ID)

import { setupPage } from "../core/page.js";
import { addWord, addWords, updateWord, deleteWord, getWord, findWordsByText, dbErrorMessage } from "../core/db.js";
import { generateWordInfo } from "../core/api.js";
import { $, $$, esc, icon, setBusy, toast, flash, highlight, loadingHtml, messageHtml, prefs, renderError } from "../core/ui.js";
import { cleanText, splitWordList } from "../shared/text.js";

const MAX_BULK = 50;
const AI_CHUNK = 10;
const MAX_EXAMPLES = 5;

export default async function mountWordForm({ page }) {
  if (page === "word-edit") {
    const { user, main } = await setupPage({ active: "words", title: "단어 수정" });
    await mountEdit(user, main);
  } else {
    const { user, main } = await setupPage({ active: "add", title: "단어 추가" });
    mountAdd(user, main);
  }
}

/* ---------------- 공통: 단어 입력 폼 ---------------- */

function exampleRowHtml(example = {}) {
  return `<div class="example-row">
    <div class="inputs">
      <input type="text" data-field="sentence" maxlength="300" placeholder="예문 (원문)" aria-label="예문" value="${esc(example.sentence || "")}" />
      <input type="text" data-field="translation" maxlength="300" placeholder="해석" aria-label="예문 해석" value="${esc(example.translation || "")}" />
    </div>
    <button type="button" class="icon-btn danger" data-action="remove-example" aria-label="예문 삭제" title="예문 삭제">${icon("x")}</button>
  </div>`;
}

function formHtml({ editing }) {
  return `<form class="card stack word-form" novalidate>
    <div class="field-row">
      <label class="field">단어 · 표현
        <input type="text" name="word" required maxlength="60" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="예: resilient, look forward to" />
      </label>
      <button type="button" class="btn btn-ai" data-action="ai">${icon("sparkles")}<span>${editing ? "AI로 다시 채우기" : "AI로 뜻·예문 채우기"}</span></button>
    </div>
    <div class="suggestion" data-suggestion hidden></div>
    <label class="field">뜻
      <textarea name="meaning" rows="2" required maxlength="300" placeholder="예: 회복력 있는, 탄력 있는"></textarea>
    </label>
    <div class="grid-2">
      <label class="field">품사 <input type="text" name="partOfSpeech" maxlength="60" placeholder="예: 형용사" /></label>
      <label class="field">발음 <input type="text" name="pronunciation" maxlength="80" placeholder="예: /rɪˈzɪl.jənt/" /></label>
    </div>
    <fieldset>
      <legend>예문</legend>
      <div class="example-rows"></div>
      <button type="button" class="btn btn-ghost btn-sm" data-action="add-example">${icon("plus")}<span>예문 추가</span></button>
    </fieldset>
    <label class="field"><span>메모 <small>(선택)</small></span>
      <textarea name="memo" rows="2" maxlength="1000" placeholder="외우는 팁, 헷갈리는 단어 등"></textarea>
    </label>
    <input type="hidden" name="language" />
    <p class="form-error" role="alert" hidden></p>
    <div class="form-actions">
      ${editing ? `<button type="button" class="btn btn-danger" data-action="delete">${icon("trash")}<span>삭제</span></button><span class="spacer"></span>` : ""}
      ${editing ? "" : '<button type="submit" class="btn" data-continue>저장하고 계속 추가</button>'}
      <button type="submit" class="btn btn-primary">저장</button>
    </div>
  </form>`;
}

/**
 * 단어 폼에 동작을 붙입니다.
 * @param {HTMLFormElement} form
 * @param {{ initial?: object, onSave: (data: object, opts: { continueAfter: boolean }) => Promise<void>, onDelete?: () => Promise<void> }} options
 */
function bindWordForm(form, { initial, onSave, onDelete }) {
  const field = (name) => form.elements.namedItem(name);
  const rows = $(".example-rows", form);
  const errorBox = $(".form-error", form);
  const suggestion = $("[data-suggestion]", form);
  const aiButton = $('[data-action="ai"]', form);

  const showError = (message) => {
    errorBox.textContent = message;
    errorBox.hidden = false;
  };
  const hideError = () => {
    errorBox.hidden = true;
  };

  function setExamples(examples) {
    const list = examples.length ? examples : [{}];
    rows.innerHTML = list.slice(0, MAX_EXAMPLES).map(exampleRowHtml).join("");
  }

  function fill(data) {
    for (const name of ["word", "meaning", "partOfSpeech", "pronunciation", "memo", "language"]) {
      if (data[name] !== undefined) field(name).value = data[name] ?? "";
    }
    if (data.examples) setExamples(data.examples);
  }

  function read() {
    return {
      word: cleanText(field("word").value, 60),
      meaning: cleanText(field("meaning").value, 300),
      partOfSpeech: cleanText(field("partOfSpeech").value, 60),
      pronunciation: cleanText(field("pronunciation").value, 80),
      memo: field("memo").value.trim(),
      language: field("language").value,
      examples: $$(".example-row", rows)
        .map((row) => ({
          sentence: cleanText($('[data-field="sentence"]', row).value, 300),
          translation: cleanText($('[data-field="translation"]', row).value, 300),
        }))
        .filter((example) => example.sentence),
    };
  }

  function reset() {
    form.reset();
    field("language").value = "";
    setExamples([]);
    suggestion.hidden = true;
    hideError();
  }

  async function runAi() {
    if (aiButton.disabled) return; // 이미 생성 중
    const word = cleanText(field("word").value, 200);
    hideError();
    if (!word) {
      showError("먼저 단어를 입력해 주세요.");
      field("word").focus();
      return;
    }
    if (word.length > 60) {
      showError("단어·표현은 60자 이하로 입력해 주세요.");
      return;
    }
    suggestion.hidden = true;
    const done = setBusy(aiButton, "AI가 작성 중…");
    try {
      const { items } = await generateWordInfo([word], 2);
      const item = items?.[0];
      if (!item) throw new Error("AI가 이 단어의 뜻을 만들지 못했어요. 철자를 확인해 주세요.");
      fill({
        meaning: item.meaning,
        partOfSpeech: item.partOfSpeech,
        pronunciation: item.pronunciation,
        language: item.language,
        examples: item.examples,
      });
      if (item.corrected) {
        suggestion.innerHTML = `<span>혹시 <strong>${esc(item.corrected)}</strong>을(를) 찾으셨나요?</span>
          <button type="button" class="btn btn-sm" data-action="apply-suggestion">바꿔서 다시 만들기</button>`;
        suggestion.dataset.value = item.corrected;
        suggestion.hidden = false;
      }
      toast("AI가 뜻과 예문을 채웠어요. 확인 후 저장하세요.", "success");
    } catch (err) {
      showError(err?.message || "AI 생성에 실패했어요.");
    } finally {
      done();
    }
  }

  aiButton.addEventListener("click", runAi);

  // 뜻이 비어 있을 때 단어 칸에서 Enter → AI로 채우기 (한글 조합 중 Enter는 무시)
  field("word").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing && !field("meaning").value.trim()) {
      event.preventDefault();
      runAi();
    }
  });

  form.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "add-example") {
      if ($$(".example-row", rows).length >= MAX_EXAMPLES) {
        toast(`예문은 ${MAX_EXAMPLES}개까지 저장할 수 있어요.`);
        return;
      }
      rows.insertAdjacentHTML("beforeend", exampleRowHtml());
      $$('.example-row [data-field="sentence"]', rows).at(-1).focus();
    } else if (action === "remove-example") {
      button.closest(".example-row").remove();
      if (!$(".example-row", rows)) setExamples([]);
    } else if (action === "apply-suggestion") {
      field("word").value = suggestion.dataset.value || field("word").value;
      runAi();
    } else if (action === "delete" && onDelete) {
      if (!confirm(`'${initial?.word || field("word").value}'을(를) 삭제할까요?`)) return;
      const done = setBusy(button, "삭제 중…");
      onDelete().catch((err) => {
        done();
        showError(dbErrorMessage(err));
      });
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideError();
    const data = read();
    if (!data.word) {
      showError("단어를 입력해 주세요.");
      field("word").focus();
      return;
    }
    if (!data.meaning) {
      showError("뜻을 입력해 주세요. 'AI로 뜻·예문 채우기'를 눌러도 돼요.");
      field("meaning").focus();
      return;
    }
    const button = event.submitter || $('button[type="submit"].btn-primary', form);
    const done = setBusy(button, "저장 중…");
    try {
      await onSave(data, { continueAfter: Boolean(event.submitter?.hasAttribute("data-continue")) });
    } catch (err) {
      showError(dbErrorMessage(err));
    } finally {
      done();
    }
  });

  if (initial) fill(initial);
  else setExamples([]);
  return { reset, focus: () => field("word").focus(), setWord: (value) => (field("word").value = value) };
}

/* ---------------- /words/edit/ ---------------- */

async function mountEdit(user, main) {
  const id = new URLSearchParams(location.search).get("id");
  const backLink = '<a class="btn btn-primary" href="/words/">단어장으로</a>';
  if (!id) {
    main.innerHTML = messageHtml({ title: "수정할 단어를 찾을 수 없어요", actions: backLink });
    return;
  }
  main.innerHTML = loadingHtml();

  let word;
  try {
    word = await getWord(user.uid, id);
  } catch (err) {
    renderError(main, "단어를 불러오지 못했어요", dbErrorMessage(err));
    return;
  }
  if (!word) {
    main.innerHTML = messageHtml({ title: "단어를 찾을 수 없어요", body: "이미 삭제되었을 수 있어요.", actions: backLink });
    return;
  }

  main.innerHTML = `
    <div class="page-head">
      <div><h1 class="page-title">단어 수정</h1><p class="page-desc">${esc(word.word)}</p></div>
      <a class="btn btn-ghost" href="/words/">목록으로</a>
    </div>
    ${formHtml({ editing: true })}`;

  bindWordForm($("form", main), {
    initial: word,
    async onSave(data) {
      if (data.word.toLowerCase() !== word.word.toLowerCase()) {
        const existing = (await findWordsByText(user.uid, [data.word])).get(data.word.toLowerCase());
        if (existing && existing.id !== word.id) throw new Error(`'${existing.word}'은(는) 이미 단어장에 있어요.`);
      }
      await updateWord(user.uid, word.id, data);
      flash(`'${data.word}'을(를) 수정했어요.`);
      location.href = "/words/";
    },
    async onDelete() {
      await deleteWord(user.uid, word.id);
      flash(`'${word.word}'을(를) 삭제했어요.`);
      location.href = "/words/";
    },
  });
}

/* ---------------- /words/add/ ---------------- */

function bulkHtml() {
  return `<section class="card stack">
      <label class="field"><span>단어 목록 <small>한 줄에 하나씩, 또는 쉼표로 구분 (최대 ${MAX_BULK}개)</small></span>
        <textarea name="bulk" rows="7" spellcheck="false" autocapitalize="none" placeholder="apple&#10;resilient&#10;look forward to"></textarea>
      </label>
      <p class="form-error" role="alert" hidden></p>
      <div class="actions"><button type="button" class="btn btn-ai" data-action="bulk-ai">${icon("sparkles")}<span>AI로 한꺼번에 만들기</span></button></div>
    </section>
    <section class="stack" data-review hidden></section>`;
}

function mountAdd(user, main) {
  main.innerHTML = `
    <div class="page-head">
      <div><h1 class="page-title">단어 추가</h1><p class="page-desc">단어만 입력하면 AI가 뜻·품사·발음·예문을 채워 줘요.</p></div>
    </div>
    <div class="tabs" role="tablist" aria-label="추가 방식">
      <button type="button" role="tab" id="tab-single" aria-controls="panel-single" data-tab="single">한 단어씩</button>
      <button type="button" role="tab" id="tab-bulk" aria-controls="panel-bulk" data-tab="bulk">여러 단어 한 번에</button>
    </div>
    <div id="panel-single" role="tabpanel" aria-labelledby="tab-single">${formHtml({ editing: false })}</div>
    <div id="panel-bulk" role="tabpanel" aria-labelledby="tab-bulk" class="stack">${bulkHtml()}</div>`;

  function selectTab(name) {
    $$("[data-tab]", main).forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.tab === name)));
    $("#panel-single", main).hidden = name !== "single";
    $("#panel-bulk", main).hidden = name !== "bulk";
    prefs.set("add-tab", name);
  }
  $$("[data-tab]", main).forEach((tab) => tab.addEventListener("click", () => selectTab(tab.dataset.tab)));

  const presetWord = cleanText(new URLSearchParams(location.search).get("word"), 60);
  selectTab(presetWord ? "single" : prefs.get("add-tab", "single") === "bulk" ? "bulk" : "single");

  const single = bindWordForm($("#panel-single form", main), {
    async onSave(data, { continueAfter }) {
      const existing = (await findWordsByText(user.uid, [data.word])).get(data.word.toLowerCase());
      if (existing) {
        if (!confirm(`'${existing.word}'은(는) 이미 단어장에 있어요.\n지금 입력한 내용으로 바꿀까요?`)) return;
        await updateWord(user.uid, existing.id, { ...data, memo: data.memo || existing.memo });
      } else {
        await addWord(user.uid, data);
      }
      if (continueAfter) {
        toast(`'${data.word}'을(를) 저장했어요.`, "success");
        single.reset();
        single.focus();
      } else {
        flash(`'${data.word}'을(를) 저장했어요.`);
        location.href = "/words/";
      }
    },
  });
  if (presetWord) single.setWord(presetWord);
  if (!$("#panel-single", main).hidden) single.focus();

  bindBulk(user, $("#panel-bulk", main));
}

function bindBulk(user, panel) {
  const textarea = $('textarea[name="bulk"]', panel);
  const errorBox = $(".form-error", panel);
  const review = $("[data-review]", panel);
  const button = $('[data-action="bulk-ai"]', panel);
  let items = [];
  let existing = new Map();

  const showError = (message) => {
    errorBox.textContent = message;
    errorBox.hidden = false;
  };

  button.addEventListener("click", async () => {
    errorBox.hidden = true;
    const words = splitWordList(textarea.value);
    if (!words.length) return showError("단어를 한 개 이상 입력해 주세요.");
    if (words.length > MAX_BULK) return showError(`한 번에 최대 ${MAX_BULK}개까지 만들 수 있어요. (지금 ${words.length}개)`);
    const tooLong = words.find((word) => word.length > 60);
    if (tooLong) return showError(`'${tooLong.slice(0, 20)}…'이(가) 너무 길어요. 단어·표현은 60자 이하로 입력해 주세요.`);

    const done = setBusy(button, `AI가 ${words.length}개 단어를 작성 중…`);
    try {
      const chunks = [];
      for (let i = 0; i < words.length; i += AI_CHUNK) chunks.push(words.slice(i, i + AI_CHUNK));
      const settled = await Promise.allSettled(chunks.map((chunk) => generateWordInfo(chunk, 2)));
      const failed = [];
      let firstError = null;
      items = [];
      settled.forEach((result, index) => {
        if (result.status === "fulfilled") {
          items.push(...result.value.items);
          failed.push(...(result.value.missing || []));
        } else {
          failed.push(...chunks[index]);
          firstError ??= result.reason;
        }
      });
      if (!items.length) throw firstError ?? new Error("AI가 단어 정보를 만들지 못했어요.");
      existing = await findWordsByText(user.uid, items.map((item) => item.word));
      renderReview(failed, firstError);
    } catch (err) {
      showError(err?.code && !err.status ? dbErrorMessage(err) : err?.message || "AI 생성에 실패했어요.");
    } finally {
      done();
    }
  });

  function renderReview(failed, firstError) {
    review.hidden = false;
    review.innerHTML = `
      <div class="card-head">
        <h2 class="section-title">확인 후 저장하세요 (${items.length}개)</h2>
        <label class="badge"><input type="checkbox" data-action="toggle-all" checked /> 전체 선택</label>
      </div>
      ${failed.length ? `<p class="notice">만들지 못한 단어: ${esc(failed.join(", "))}${firstError ? ` — ${esc(firstError.message)}` : ""}</p>` : ""}
      <div class="bulk-list">
        ${items
          .map((item, index) => {
            const duplicate = existing.has(item.word.toLowerCase());
            const example = item.examples?.[0];
            return `<div class="bulk-item${duplicate ? " is-duplicate" : ""}">
              <input type="checkbox" data-index="${index}" ${duplicate ? "" : "checked"} aria-label="${esc(item.word)} 저장" />
              <div class="bulk-body">
                <div class="bulk-word">
                  <span>${esc(item.word)}</span>
                  ${item.pronunciation ? `<span class="pron muted">${esc(item.pronunciation)}</span>` : ""}
                  ${item.partOfSpeech ? `<span class="badge">${esc(item.partOfSpeech)}</span>` : ""}
                  ${duplicate ? '<span class="badge badge-ng">이미 있음 · 체크하면 덮어씀</span>' : ""}
                  ${item.corrected ? `<span class="badge">철자 확인: ${esc(item.corrected)}</span>` : ""}
                </div>
                <input type="text" data-meaning="${index}" value="${esc(item.meaning)}" maxlength="300" aria-label="${esc(item.word)} 뜻" />
                ${example ? `<p class="bulk-example">${highlight(example.sentence, item.word)}${example.translation ? ` — ${esc(example.translation)}` : ""}</p>` : ""}
              </div>
            </div>`;
          })
          .join("")}
      </div>
      <p class="form-error" data-review-error role="alert" hidden></p>
      <div class="form-actions"><button type="button" class="btn btn-primary btn-lg" data-action="bulk-save">선택한 단어 저장</button></div>`;
    review.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  review.addEventListener("change", (event) => {
    if (event.target.matches('[data-action="toggle-all"]')) {
      $$("input[data-index]", review).forEach((box) => (box.checked = event.target.checked));
    }
  });

  review.addEventListener("click", async (event) => {
    const saveButton = event.target.closest('[data-action="bulk-save"]');
    if (!saveButton) return;
    const reviewError = $("[data-review-error]", review);
    reviewError.hidden = true;

    const selected = $$("input[data-index]:checked", review).map((box) => {
      const index = Number(box.dataset.index);
      return { ...items[index], meaning: cleanText($(`[data-meaning="${index}"]`, review).value, 300) };
    });
    if (!selected.length) {
      reviewError.textContent = "저장할 단어를 선택해 주세요.";
      reviewError.hidden = false;
      return;
    }
    const noMeaning = selected.find((item) => !item.meaning);
    if (noMeaning) {
      reviewError.textContent = `'${noMeaning.word}'의 뜻을 입력해 주세요.`;
      reviewError.hidden = false;
      return;
    }

    const done = setBusy(saveButton, "저장 중…");
    try {
      const fresh = selected.filter((item) => !existing.has(item.word.toLowerCase()));
      const replace = selected.filter((item) => existing.has(item.word.toLowerCase()));
      if (fresh.length) await addWords(user.uid, fresh);
      for (const item of replace) {
        const old = existing.get(item.word.toLowerCase());
        await updateWord(user.uid, old.id, { ...item, memo: old.memo });
      }
      flash(`단어 ${selected.length}개를 저장했어요.`);
      location.href = "/words/";
    } catch (err) {
      done();
      reviewError.textContent = dbErrorMessage(err);
      reviewError.hidden = false;
    }
  });
}
