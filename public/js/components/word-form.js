// 단어 입력 폼 — /words/add(한 단어)와 /words/edit 에서 함께 씁니다.
// "AI로 채우기"를 누르면 Gemini 가 뜻·품사·발음·예문을 채웁니다.
import { h, icon, toast, withBusy, speak } from "../ui.js";
import { aiWord } from "../api.js";
import { termKey } from "../shared/text.js";

const POS = ["명사", "동사", "형용사", "부사", "전치사", "접속사", "대명사", "감탄사", "구동사", "숙어"];
const MAX_EXAMPLES = 5;

/**
 * @param {object} opts
 * @param {object} [opts.initial]        기존 단어(수정할 때)
 * @param {string} [opts.submitLabel]
 * @param {(term: string) => object|null} [opts.findDuplicate]  같은 단어가 이미 있으면 그 단어
 * @param {(data: object) => Promise<void>} opts.onSubmit
 * @param {() => Promise<void>} [opts.onDelete]
 */
export function wordForm({ initial = {}, submitLabel = "저장", findDuplicate, onSubmit, onDelete }) {
  let lang = initial.lang || "en";

  const word = h("input", {
    class: "input input-lg",
    name: "word",
    autocomplete: "off",
    autocapitalize: "off",
    spellcheck: "false",
    enterkeyhint: "search",
    maxlength: 80,
    placeholder: "예: abandon, take off",
    value: initial.word || "",
    "aria-label": "단어",
  });
  const aiBtn = h("button", { type: "button", class: "btn primary ai-btn" }, icon("sparkles", 18), h("span", {}, "AI로 채우기"));
  const meaning = h("input", { class: "input", name: "meaning", maxlength: 200, placeholder: "예: 포기하다, 버리다", value: initial.meaning || "" });
  const pos = h("input", { class: "input", name: "pos", list: "pos-options", maxlength: 30, placeholder: "예: 동사", value: initial.pos || "" });
  const pron = h("input", { class: "input", name: "pronunciation", maxlength: 80, placeholder: "예: /əˈbændən/", value: initial.pronunciation || "" });
  const memo = h("textarea", { class: "input", name: "memo", rows: 2, maxlength: 500, placeholder: "나만의 메모 (선택)", value: initial.memo || "" });
  const examples = h("div", { class: "stack-sm" });
  const addExampleBtn = h("button", { type: "button", class: "btn ghost small" }, icon("plus", 16), "예문 추가");
  const dupBox = h("div", { class: "alert warn", hidden: true });
  const saveBtn = h("button", { type: "submit", class: "btn primary block" }, submitLabel);

  function addExample(ex = {}) {
    if (examples.children.length >= MAX_EXAMPLES) return;
    const sentence = h("textarea", { class: "input", rows: 2, maxlength: 300, placeholder: "예문", value: ex.sentence || "", "aria-label": "예문" });
    const translation = h("input", { class: "input", maxlength: 300, placeholder: "해석", value: ex.translation || "", "aria-label": "예문 해석" });
    const row = h(
      "div",
      { class: "example-edit" },
      h("div", { class: "stack-sm grow" }, sentence, translation),
      h("button", { type: "button", class: "btn icon ghost", "aria-label": "예문 삭제", title: "예문 삭제", onclick: () => { row.remove(); syncExampleBtn(); } }, icon("x", 18)),
    );
    examples.append(row);
    syncExampleBtn();
  }
  function syncExampleBtn() {
    addExampleBtn.hidden = examples.children.length >= MAX_EXAMPLES;
  }
  function setExamples(list) {
    examples.replaceChildren();
    (list?.length ? list : [{}]).forEach(addExample);
  }
  function readExamples() {
    return [...examples.querySelectorAll(".example-edit")]
      .map((row) => {
        const [s, t] = row.querySelectorAll("textarea, input");
        return { sentence: s.value.trim(), translation: t.value.trim() };
      })
      .filter((e) => e.sentence);
  }
  addExampleBtn.addEventListener("click", () => addExample());
  setExamples(initial.examples);

  function checkDuplicate() {
    const dup = findDuplicate?.(word.value) ?? null;
    dupBox.hidden = !dup;
    if (dup) {
      dupBox.replaceChildren(
        h("span", {}, `이미 단어장에 있어요: ${dup.word} — ${dup.meaning} `),
        h("a", { href: `/words/edit?id=${encodeURIComponent(dup.id)}` }, "수정하러 가기"),
      );
    }
    return dup;
  }
  word.addEventListener("change", checkDuplicate);

  async function fillWithAI() {
    const term = word.value.trim();
    if (!term) {
      word.focus();
      toast("단어를 먼저 입력하세요.", "error");
      return;
    }
    if ((meaning.value.trim() || readExamples().length) && !confirm("입력한 뜻과 예문을 AI 결과로 바꿀까요?")) return;
    await withBusy(aiBtn, "AI가 찾는 중…", async () => {
      try {
        const { items } = await aiWord([term]);
        const it = items?.[0];
        if (!it) throw new Error("AI 가 이 단어의 뜻을 찾지 못했어요. 철자를 확인하세요.");
        if (it.word && termKey(it.word) !== termKey(term)) toast(`철자를 '${it.word}'(으)로 고쳤어요.`);
        word.value = it.word || term;
        meaning.value = it.meaning || "";
        pos.value = it.pos || "";
        pron.value = it.pronunciation || "";
        lang = it.lang || "en";
        setExamples(it.examples);
        checkDuplicate();
      } catch (err) {
        toast(err.message, "error");
      }
    });
  }
  aiBtn.addEventListener("click", fillWithAI);

  const form = h(
    "form",
    { class: "card stack word-form", novalidate: true },
    h(
      "div",
      { class: "field" },
      h("span", { class: "field-label" }, "단어 · 숙어"),
      h("div", { class: "input-row ai-row" }, word, aiBtn),
      h("span", { class: "field-hint" }, "단어만 입력하고 Enter 또는 AI로 채우기를 누르면 뜻과 예문이 채워져요."),
    ),
    dupBox,
    h("label", { class: "field" }, h("span", { class: "field-label" }, "뜻"), meaning),
    h(
      "div",
      { class: "field-grid" },
      h("label", { class: "field" }, h("span", { class: "field-label" }, "품사"), pos),
      h(
        "div",
        { class: "field" },
        h("span", { class: "field-label" }, "발음"),
        h(
          "div",
          { class: "input-row" },
          pron,
          h("button", { type: "button", class: "btn icon", "aria-label": "발음 듣기", title: "발음 듣기", onclick: () => word.value.trim() && speak(word.value.trim(), lang) }, icon("volume", 18)),
        ),
      ),
    ),
    h("datalist", { id: "pos-options" }, POS.map((p) => h("option", { value: p }))),
    h("div", { class: "field" }, h("span", { class: "field-label" }, "예문"), examples, h("div", {}, addExampleBtn)),
    h("label", { class: "field" }, h("span", { class: "field-label" }, "메모"), memo),
    h(
      "div",
      { class: "btn-row" },
      saveBtn,
      onDelete ? h("button", { type: "button", class: "btn danger", onclick: onDelete }, icon("trash", 18), "삭제") : null,
    ),
  );

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const term = word.value.trim();
    if (!term) {
      word.focus();
      toast("단어를 입력하세요.", "error");
      return;
    }
    if (!meaning.value.trim()) {
      // 뜻이 비어 있는 채로 Enter → 먼저 AI 로 채웁니다.
      await fillWithAI();
      return;
    }
    const dup = checkDuplicate();
    if (dup && !confirm(`'${dup.word}' 은(는) 이미 단어장에 있어요. 그래도 저장할까요?`)) return;
    await withBusy(saveBtn, "저장 중…", async () => {
      try {
        await onSubmit({
          word: term,
          meaning: meaning.value.trim(),
          pos: pos.value.trim(),
          pronunciation: pron.value.trim(),
          lang,
          examples: readExamples(),
          memo: memo.value.trim(),
        });
      } catch (err) {
        toast(err.message, "error");
      }
    });
  });

  return {
    form,
    focus: () => word.focus(),
    reset() {
      form.reset();
      word.value = "";
      meaning.value = "";
      pos.value = "";
      pron.value = "";
      memo.value = "";
      lang = "en";
      dupBox.hidden = true;
      setExamples([]);
      word.focus();
    },
  };
}
