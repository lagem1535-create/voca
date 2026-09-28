// /test — 시험 선택 (종류 · 범위 · 문제 수 · 방향)
import { h, icon, loading, errorBox, emptyState } from "../ui.js";
import { watchWords } from "../store.js";
import { SCOPES, DIRECTIONS, COUNTS, MAX_BLANK_QUESTIONS, wordsInScope, canBuildChoice } from "../quiz.js";

const TYPES = {
  choice: { title: "5지선다", desc: "단어를 보고 알맞은 뜻 고르기 (또는 반대로)", icon: "list" },
  blank: { title: "AI 빈칸", desc: "AI 가 매번 새로 만든 예문의 빈칸에 단어 쓰기", icon: "sparkles" },
};
const STORE_KEY = "voca:test-settings";

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
  } catch {
    return {};
  }
}

export default function mount(root, { query, navigate, signal }) {
  const saved = loadSaved();
  const pick = (value, allowed, fallback) => (value != null && allowed.includes(String(value)) ? String(value) : fallback);
  const settings = {
    type: pick(query.get("type") ?? saved.type, Object.keys(TYPES), "choice"),
    scope: pick(query.get("scope") ?? saved.scope, Object.keys(SCOPES), "all"),
    count: Number(pick(query.get("count") ?? saved.count, COUNTS.map(String), "10")),
    dir: pick(query.get("dir") ?? saved.dir, Object.keys(DIRECTIONS), "w2m"),
  };

  let words = [];
  const body = h("div", { class: "stack" }, loading());
  root.append(h("div", { class: "page-head" }, h("h1", { class: "page-title" }, "시험 선택")), body);

  watchWords((s) => {
    if (s.status === "error") {
      body.replaceChildren(errorBox(s.error, () => location.reload()));
      return;
    }
    words = s.words;
    draw();
  }, signal);

  function chip(label, pressed, onclick, disabled = false, extra = null) {
    return h("button", { type: "button", class: "chip", "aria-pressed": String(pressed), disabled, onclick }, label, extra);
  }

  function draw() {
    if (!words.length) {
      body.replaceChildren(
        emptyState("단어를 먼저 추가하세요", "단어장에 단어가 있어야 시험을 볼 수 있어요.", h("a", { class: "btn primary", href: "/words/add" }, icon("plus", 18), "단어 추가")),
      );
      return;
    }

    const types = h(
      "div",
      { class: "type-cards", role: "radiogroup", "aria-label": "시험 종류" },
      Object.entries(TYPES).map(([id, t]) =>
        h(
          "label",
          { class: `type-card${settings.type === id ? " selected" : ""}` },
          h("input", {
            type: "radio",
            name: "type",
            value: id,
            checked: settings.type === id,
            onchange: () => {
              settings.type = id;
              draw();
            },
          }),
          h("span", { class: "type-icon" }, icon(t.icon, 24)),
          h("span", { class: "type-title" }, t.title),
          h("span", { class: "type-desc" }, t.desc),
        ),
      ),
    );

    const scopes = h(
      "div",
      { class: "chips" },
      Object.entries(SCOPES).map(([id, s]) => {
        const n = wordsInScope(words, id).length;
        return chip(s.label, settings.scope === id, () => { settings.scope = id; draw(); }, n === 0, h("span", { class: "chip-count" }, String(n)));
      }),
    );

    const counts = h(
      "div",
      { class: "chips" },
      COUNTS.map((n) => chip(n ? `${n}문제` : "전체", settings.count === n, () => { settings.count = n; draw(); })),
    );

    const dirs =
      settings.type === "choice"
        ? h("div", { class: "chips" }, Object.entries(DIRECTIONS).map(([id, label]) => chip(label, settings.dir === id, () => { settings.dir = id; draw(); })))
        : null;

    const available = wordsInScope(words, settings.scope).length;
    const max = settings.type === "blank" ? MAX_BLANK_QUESTIONS : Infinity;
    const total = Math.min(settings.count || available, available, max);
    const problems = [];
    if (!available) problems.push(`'${SCOPES[settings.scope].label}' 범위에 단어가 없어요. 다른 범위를 고르세요.`);
    if (settings.type === "choice" && !canBuildChoice(words)) {
      problems.push("5지선다는 뜻이 서로 다른 단어가 5개 이상 있어야 해요. 단어를 더 추가하거나 AI 빈칸 시험을 골라 보세요.");
    }
    const notes = [];
    if (settings.type === "blank" && (settings.count === 0 || settings.count > max) && available > max) notes.push(`AI 빈칸 시험은 한 번에 최대 ${max}문제예요.`);

    const start = h(
      "button",
      {
        type: "button",
        class: "btn primary block lg",
        disabled: problems.length > 0,
        onclick: () => {
          try {
            localStorage.setItem(STORE_KEY, JSON.stringify(settings));
          } catch {
            // 저장 못 해도 시험은 볼 수 있음
          }
          const params = new URLSearchParams({ scope: settings.scope, count: String(settings.count) });
          if (settings.type === "choice") params.set("dir", settings.dir);
          navigate(`/test/${settings.type}?${params}`);
        },
      },
      problems.length ? "시험을 시작할 수 없어요" : `${TYPES[settings.type].title} ${total}문제 시작`,
      problems.length ? null : icon("arrow", 18),
    );

    body.replaceChildren(
      h("section", { class: "stack-sm" }, h("h2", { class: "section-title" }, "시험 종류"), types),
      h("section", { class: "stack-sm" }, h("h2", { class: "section-title" }, "범위"), scopes),
      h("section", { class: "stack-sm" }, h("h2", { class: "section-title" }, "문제 수"), counts),
      dirs ? h("section", { class: "stack-sm" }, h("h2", { class: "section-title" }, "방향"), dirs) : null,
      ...problems.map((p) => h("div", { class: "alert warn" }, p)),
      ...notes.map((p) => h("div", { class: "alert info" }, p)),
      start,
    );
  }
}
