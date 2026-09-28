// /words — 단어장 (검색 · 필터 · 정렬 · 발음 · 별표 · 수정 · 삭제)
import { h, icon, toast, loading, errorBox, emptyState, speakButton, timeAgo } from "../ui.js";
import { watchWords, setStar, deleteWord } from "../store.js";
import { needsReview, tested, mastered, byRecent } from "../quiz.js";
import { normalizeAnswer } from "../shared/text.js";

const FILTERS = {
  all: { label: "전체", test: () => true },
  starred: { label: "별표", test: (w) => w.starred },
  review: { label: "복습 필요", test: needsReview },
  new: { label: "안 본 단어", test: (w) => !tested(w) },
  mastered: { label: "외운 단어", test: mastered },
};

const SORTS = {
  recent: { label: "최근 추가순", fn: byRecent },
  old: { label: "오래된 순", fn: (a, b) => -byRecent(a, b) },
  abc: { label: "알파벳순", fn: (a, b) => a.word.localeCompare(b.word, "en", { sensitivity: "base" }) },
  wrong: { label: "많이 틀린 순", fn: (a, b) => b.wrong - a.wrong || byRecent(a, b) },
};

const PAGE = 100;

export default function mount(root, { query, signal }) {
  const state = {
    q: "",
    filter: FILTERS[query.get("filter")] ? query.get("filter") : "all",
    sort: "recent",
    limit: PAGE,
    open: new Set(),
  };
  let words = [];
  let status = "loading";
  let error = null;

  const search = h("input", { type: "search", class: "input", placeholder: "단어나 뜻으로 검색", "aria-label": "검색", autocomplete: "off" });
  const sortSel = h(
    "select",
    { class: "input select", "aria-label": "정렬" },
    Object.entries(SORTS).map(([id, s]) => h("option", { value: id }, s.label)),
  );
  const chips = h("div", { class: "chips", role: "group", "aria-label": "필터" });
  const count = h("p", { class: "muted small" });
  const list = h("ul", { class: "word-list" });
  const more = h("button", { type: "button", class: "btn block", hidden: true }, "더 보기");
  const body = h("div", { class: "stack" });

  search.addEventListener("input", () => {
    state.q = search.value;
    state.limit = PAGE;
    draw();
  });
  sortSel.addEventListener("change", () => {
    state.sort = sortSel.value;
    draw();
  });
  more.addEventListener("click", () => {
    state.limit += PAGE;
    draw();
  });

  root.append(
    h(
      "div",
      { class: "page-head" },
      h("h1", { class: "page-title" }, "단어장"),
      h("a", { class: "btn primary small", href: "/words/add" }, icon("plus", 18), "단어 추가"),
    ),
    body,
  );
  body.append(loading());

  watchWords((s) => {
    words = s.words;
    status = s.status;
    error = s.error;
    draw();
  }, signal);

  function visible() {
    const q = normalizeAnswer(state.q);
    const f = FILTERS[state.filter].test;
    return words
      .filter((w) => f(w) && (!q || normalizeAnswer(`${w.word} ${w.meaning} ${w.memo}`).includes(q)))
      .sort(SORTS[state.sort].fn);
  }

  function drawChips() {
    chips.replaceChildren(
      ...Object.entries(FILTERS).map(([id, f]) =>
        h(
          "button",
          {
            type: "button",
            class: "chip",
            "aria-pressed": String(state.filter === id),
            onclick: () => {
              state.filter = id;
              state.limit = PAGE;
              history.replaceState(null, "", id === "all" ? "/words" : `/words?filter=${id}`);
              draw();
            },
          },
          f.label,
          h("span", { class: "chip-count" }, String(words.filter(f.test).length)),
        ),
      ),
    );
  }

  function draw() {
    if (status === "error") {
      body.replaceChildren(errorBox(error, () => location.reload()));
      return;
    }
    if (status !== "ready") return;
    if (!words.length) {
      body.replaceChildren(
        emptyState(
          "아직 단어가 없어요",
          "단어만 입력하면 AI 가 뜻과 예문을 채워 줘요.",
          h("a", { class: "btn primary", href: "/words/add" }, icon("plus", 18), "단어 추가"),
          h("a", { class: "btn", href: "/words/add?mode=bulk" }, "여러 단어 한 번에"),
        ),
      );
      return;
    }
    if (!body.contains(list)) body.replaceChildren(h("div", { class: "toolbar" }, h("div", { class: "search" }, icon("search", 18), search), sortSel), chips, count, list, more);

    drawChips();
    const items = visible();
    count.textContent = state.q || state.filter !== "all" ? `${items.length}개 / 전체 ${words.length}개` : `전체 ${words.length}개`;
    list.replaceChildren(...items.slice(0, state.limit).map(item));
    if (!items.length) list.append(h("li", { class: "empty small" }, "조건에 맞는 단어가 없어요."));
    more.hidden = items.length <= state.limit;
  }

  function item(w) {
    const open = state.open.has(w.id);
    const li = h("li", { class: `word-item${open ? " open" : ""}` });
    const main = h(
      "button",
      {
        type: "button",
        class: "word-main",
        "aria-expanded": String(open),
        onclick: () => {
          if (state.open.has(w.id)) state.open.delete(w.id);
          else state.open.add(w.id);
          li.replaceWith(item(w));
        },
      },
      h(
        "span",
        { class: "word-line" },
        h("span", { class: "word-text", lang: w.lang }, w.word),
        w.pronunciation ? h("span", { class: "word-pron" }, w.pronunciation) : null,
        w.pos ? h("span", { class: "tag" }, w.pos) : null,
        needsReview(w) ? h("span", { class: "tag danger" }, `틀림 ${w.wrong}`) : null,
        mastered(w) ? h("span", { class: "tag success" }, "외움") : null,
      ),
      h("span", { class: "word-meaning" }, w.meaning),
    );
    const actions = h(
      "div",
      { class: "word-actions" },
      speakButton(w.word, w.lang, `${w.word} 발음 듣기`),
      h(
        "button",
        {
          type: "button",
          class: `btn icon ghost star${w.starred ? " on" : ""}`,
          "aria-pressed": String(w.starred),
          "aria-label": w.starred ? "별표 해제" : "별표",
          title: w.starred ? "별표 해제" : "별표",
          onclick: () => setStar(w.id, !w.starred).catch((err) => toast(err.message, "error")),
        },
        icon("star", 18),
      ),
    );
    li.append(h("div", { class: "word-row" }, main, actions));
    if (open) li.append(detail(w));
    return li;
  }

  function detail(w) {
    return h(
      "div",
      { class: "word-detail stack-sm" },
      w.examples.length
        ? h(
            "ul",
            { class: "examples" },
            w.examples.map((ex) =>
              h(
                "li",
                { class: "example" },
                h("span", { class: "example-line" }, h("span", { lang: w.lang }, ex.sentence), speakButton(ex.sentence, w.lang, "예문 듣기")),
                ex.translation ? h("span", { class: "muted" }, ex.translation) : null,
              ),
            ),
          )
        : h("p", { class: "muted small" }, "예문이 없어요."),
      w.memo ? h("p", { class: "memo" }, w.memo) : null,
      h(
        "p",
        { class: "muted small" },
        `맞힘 ${w.correct} · 틀림 ${w.wrong} · 연속 정답 ${w.streak}`,
        w.lastTestedAt ? ` · 마지막 시험 ${timeAgo(w.lastTestedAt)}` : " · 아직 시험 안 봄",
        w.createdAt ? ` · 추가 ${timeAgo(w.createdAt)}` : "",
      ),
      h(
        "div",
        { class: "btn-row" },
        h("a", { class: "btn small", href: `/words/edit?id=${encodeURIComponent(w.id)}` }, icon("edit", 16), "수정"),
        h(
          "button",
          {
            type: "button",
            class: "btn small danger",
            onclick: async () => {
              if (!confirm(`'${w.word}' 을(를) 삭제할까요?`)) return;
              try {
                await deleteWord(w.id);
                state.open.delete(w.id);
                toast("삭제했어요.");
              } catch (err) {
                toast(err.message, "error");
              }
            },
          },
          icon("trash", 16),
          "삭제",
        ),
      ),
    );
  }
}
