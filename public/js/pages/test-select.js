// /test/ — 시험 선택: 종류(5지선다 · AI 빈칸), 범위, 문제 수, 방향

import { setupPage } from "../core/page.js";
import { listWords, dbErrorMessage } from "../core/db.js";
import { SCOPES, COUNTS, DIRECTIONS, OPTION_COUNT, MAX_BLANK_QUESTIONS, wordsInScope, canBuildChoice, parseCount } from "../core/quiz.js";
import { $, esc, icon, loadingHtml, messageHtml, prefs, renderError } from "../core/ui.js";

const TYPES = [
  { value: "choice", label: "5지선다" },
  { value: "blank", label: "AI 빈칸" },
];

function pickValue(candidates, allowed, fallback) {
  return candidates.find((value) => allowed.includes(value)) ?? fallback;
}

function radioHtml(name, value, label, disabled = false) {
  return `<label><input type="radio" name="${name}" value="${esc(value)}"${disabled ? " disabled" : ""} /><span>${label}</span></label>`;
}

export default async function mountTestSelect() {
  const { user, main } = await setupPage({ active: "test", title: "시험 선택" });
  main.innerHTML = loadingHtml();

  let words;
  try {
    words = await listWords(user.uid);
  } catch (err) {
    renderError(main, "단어장을 불러오지 못했어요", dbErrorMessage(err));
    return;
  }
  if (!words.length) {
    main.innerHTML = messageHtml({
      title: "시험 볼 단어가 없어요",
      body: "먼저 단어를 추가해 주세요.",
      actions: '<a class="btn btn-primary" href="/words/add/">단어 추가</a>',
    });
    return;
  }

  const scopeSize = Object.fromEntries(SCOPES.map((scope) => [scope.value, wordsInScope(words, scope.value).length]));
  const choiceReady = canBuildChoice(words);
  const params = new URLSearchParams(location.search);
  const saved = prefs.get("test-options", {}) || {};
  const values = (list) => list.map((item) => item.value);
  const initial = {
    type: pickValue([params.get("type"), saved.type], values(TYPES), choiceReady ? "choice" : "blank"),
    scope: pickValue([params.get("scope"), saved.scope].filter((scope) => scopeSize[scope] > 0), values(SCOPES), "all"),
    count: pickValue([params.get("count"), saved.count], values(COUNTS), "10"),
    dir: pickValue([params.get("dir"), saved.dir], values(DIRECTIONS), "w2m"),
  };

  main.innerHTML = `
    <div class="page-head">
      <div><h1 class="page-title">시험 보기</h1><p class="page-desc">내 단어 ${words.length}개로 시험을 봐요.</p></div>
    </div>
    <form class="stack test-form">
      <fieldset>
        <legend>시험 종류</legend>
        <div class="choice-cards">
          <label class="choice-card">
            <input type="radio" name="type" value="choice" />
            <span class="choice-icon">5</span>
            <strong>5지선다</strong>
            <small>보기 5개 중에서 알맞은 뜻 또는 단어를 골라요.</small>
          </label>
          <label class="choice-card">
            <input type="radio" name="type" value="blank" />
            <span class="choice-icon ai">${icon("sparkles")}</span>
            <strong>AI 빈칸</strong>
            <small>AI가 새로 만든 예문의 빈칸에 들어갈 단어를 직접 써요.</small>
          </label>
        </div>
      </fieldset>
      <section class="card stack">
        <fieldset>
          <legend>범위</legend>
          <div class="segmented">${SCOPES.map((scope) =>
            radioHtml("scope", scope.value, `${esc(scope.label)} <small>${scopeSize[scope.value]}</small>`, scopeSize[scope.value] === 0),
          ).join("")}</div>
        </fieldset>
        <fieldset>
          <legend>문제 수</legend>
          <div class="segmented">${COUNTS.map((count) => radioHtml("count", count.value, esc(count.label))).join("")}</div>
        </fieldset>
        <fieldset data-choice-only>
          <legend>문제 방향</legend>
          <div class="segmented">${DIRECTIONS.map((dir) => radioHtml("dir", dir.value, esc(dir.label))).join("")}</div>
        </fieldset>
        <p class="notice" data-warning hidden></p>
        <p class="hint" data-summary></p>
      </section>
      <button type="submit" class="btn btn-primary btn-lg btn-block">${icon("check")}<span>시험 시작</span></button>
    </form>`;

  const form = $(".test-form", main);
  const submit = $('button[type="submit"]', form);
  const warning = $("[data-warning]", form);
  const summary = $("[data-summary]", form);

  for (const [name, value] of Object.entries(initial)) {
    const input = $(`input[name="${name}"][value="${value}"]`, form);
    if (input) input.checked = true;
  }

  const current = () => Object.fromEntries(["type", "scope", "count", "dir"].map((name) => [name, $(`input[name="${name}"]:checked`, form)?.value]));

  function update() {
    const { type, scope, count } = current();
    $("[data-choice-only]", form).hidden = type !== "choice";
    const available = scopeSize[scope] ?? 0;
    const limit = type === "blank" ? MAX_BLANK_QUESTIONS : Infinity;
    const total = Math.min(parseCount(count), available, limit);
    const scopeLabel = SCOPES.find((item) => item.value === scope)?.label ?? "";

    let message = "";
    if (type === "choice" && !choiceReady) {
      message = `5지선다는 뜻이 서로 다른 단어가 ${OPTION_COUNT}개 이상 있어야 해요. 단어를 더 추가하거나 AI 빈칸 시험을 골라 주세요.`;
    } else if (!available) {
      message = "이 범위에 해당하는 단어가 없어요. 다른 범위를 골라 주세요.";
    }
    warning.textContent = message;
    warning.hidden = !message;
    submit.disabled = Boolean(message);

    const typeLabel = TYPES.find((item) => item.value === type)?.label ?? "";
    const capped = type === "blank" && parseCount(count) > MAX_BLANK_QUESTIONS && available > MAX_BLANK_QUESTIONS;
    summary.textContent = message
      ? ""
      : `${typeLabel} · ${scopeLabel}에서 ${total}문제${capped ? ` (AI 빈칸은 한 번에 최대 ${MAX_BLANK_QUESTIONS}문제)` : ""}`;
  }

  form.addEventListener("change", update);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    const options = current();
    prefs.set("test-options", options);
    const query = new URLSearchParams({ scope: options.scope, count: options.count });
    if (options.type === "choice") query.set("dir", options.dir);
    location.href = `/test/${options.type}/?${query}`;
  });

  update();
}
