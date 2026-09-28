// /words/add — 단어 추가 (한 단어 / 여러 단어 한 번에) + AI 뜻·예문
import { h, icon, toast, withBusy, speakButton } from "../ui.js";
import { wordForm } from "../components/word-form.js";
import { watchWords, addWord, addWords } from "../store.js";
import { aiWord } from "../api.js";
import { splitTerms, termKey } from "../shared/text.js";

const MAX_BULK = 30;

export default function mount(root, { query, signal }) {
  let words = [];
  watchWords((s) => {
    words = s.words;
  }, signal);
  const findDuplicate = (term) => {
    const key = termKey(term);
    return key ? words.find((w) => termKey(w.word) === key) ?? null : null;
  };

  // ── 한 단어 ──
  const recent = h("ul", { class: "mini-list" });
  const single = wordForm({
    submitLabel: "단어장에 저장",
    findDuplicate,
    onSubmit: async (data) => {
      await addWord(data);
      toast(`'${data.word}' 저장했어요.`, "success");
      recent.prepend(h("li", {}, h("strong", { lang: data.lang }, data.word), h("span", { class: "muted" }, data.meaning)));
      recentBox.hidden = false;
      single.reset();
    },
  });
  const recentBox = h("section", { class: "card", hidden: true }, h("h2", { class: "card-title" }, "방금 추가한 단어"), recent);
  const singlePanel = h("div", { class: "stack" }, single.form, recentBox);

  // ── 여러 단어 ──
  const bulkInput = h("textarea", {
    class: "input",
    rows: 7,
    placeholder: "한 줄에 하나씩, 또는 쉼표로 구분해 입력하세요.\n예)\nabandon\ntake off\nreluctant",
    "aria-label": "여러 단어",
  });
  const bulkCount = h("span", { class: "field-hint" }, `최대 ${MAX_BULK}개`);
  const bulkBtn = h("button", { type: "button", class: "btn primary block" }, icon("sparkles", 18), "AI로 뜻·예문 만들기");
  const bulkResult = h("div", { class: "stack" });
  bulkInput.addEventListener("input", () => {
    const n = splitTerms(bulkInput.value).length;
    bulkCount.textContent = n ? `${n}개 / 최대 ${MAX_BULK}개` : `최대 ${MAX_BULK}개`;
    bulkCount.classList.toggle("danger-text", n > MAX_BULK);
  });

  bulkBtn.addEventListener("click", () => {
    const terms = splitTerms(bulkInput.value);
    if (!terms.length) {
      bulkInput.focus();
      toast("단어를 입력하세요.", "error");
      return;
    }
    if (terms.length > MAX_BULK) {
      toast(`한 번에 ${MAX_BULK}개까지 만들 수 있어요.`, "error");
      return;
    }
    return withBusy(bulkBtn, `AI가 ${terms.length}개 단어를 정리하는 중…`, async () => {
      try {
        const { items, missing } = await aiWord(terms);
        if (!signal.aborted) showBulk(items, missing || []);
      } catch (err) {
        toast(err.message, "error");
      }
    });
  });

  function showBulk(items, missing) {
    const rows = items.map((it) => {
      const dup = findDuplicate(it.word);
      const check = h("input", { type: "checkbox", checked: !dup, "aria-label": `${it.word} 저장` });
      const meaningInput = h("input", { class: "input", value: it.meaning, maxlength: 200, "aria-label": `${it.word} 뜻` });
      const ex = it.examples?.[0];
      const el = h(
        "li",
        { class: `bulk-item${dup ? " dup" : ""}` },
        h("label", { class: "bulk-check" }, check),
        h(
          "div",
          { class: "stack-sm grow" },
          h(
            "div",
            { class: "word-line" },
            h("strong", { class: "word-text", lang: it.lang }, it.word),
            it.pronunciation ? h("span", { class: "word-pron" }, it.pronunciation) : null,
            it.pos ? h("span", { class: "tag" }, it.pos) : null,
            dup ? h("span", { class: "tag warn" }, "이미 있음") : null,
            speakButton(it.word, it.lang),
          ),
          meaningInput,
          ex ? h("p", { class: "example" }, h("span", { lang: it.lang }, ex.sentence), h("span", { class: "muted" }, ex.translation)) : null,
        ),
      );
      check.addEventListener("change", sync);
      return { it, check, meaningInput, el };
    });

    const saveBtn = h("button", { type: "button", class: "btn primary block" });
    function sync() {
      const n = rows.filter((r) => r.check.checked).length;
      saveBtn.textContent = `선택한 ${n}개 저장`;
      saveBtn.disabled = n === 0;
    }
    sync();

    saveBtn.addEventListener("click", () =>
      withBusy(saveBtn, "저장 중…", async () => {
        const picked = rows
          .filter((r) => r.check.checked)
          .map((r) => ({ ...r.it, meaning: r.meaningInput.value.trim() || r.it.meaning }));
        try {
          await addWords(picked);
          toast(`${picked.length}개 단어를 저장했어요.`, "success");
          bulkInput.value = "";
          bulkInput.dispatchEvent(new Event("input"));
          bulkResult.replaceChildren(
            h("div", { class: "alert success" }, `${picked.length}개 저장 완료! `, h("a", { href: "/words" }, "단어장 보기"), " · ", h("a", { href: "/test" }, "바로 시험 보기")),
          );
        } catch (err) {
          toast(err.message, "error");
        }
      }),
    );

    bulkResult.replaceChildren(
      h(
        "section",
        { class: "card stack" },
        h("h2", { class: "card-title" }, `AI 결과 ${items.length}개`, h("span", { class: "muted small" }, " — 뜻은 바로 고칠 수 있어요")),
        missing.length ? h("div", { class: "alert warn" }, `AI 가 찾지 못한 단어: ${missing.join(", ")}`) : null,
        h("ul", { class: "bulk-list" }, rows.map((r) => r.el)),
        saveBtn,
      ),
    );
  }

  const bulkPanel = h(
    "div",
    { class: "stack" },
    h("section", { class: "card stack" }, h("label", { class: "field" }, h("span", { class: "field-label" }, "여러 단어"), bulkInput, bulkCount), bulkBtn),
    bulkResult,
  );

  // ── 탭 ──
  const tabSingle = h("button", { type: "button", role: "tab" }, "한 단어");
  const tabBulk = h("button", { type: "button", role: "tab" }, "여러 단어 한 번에");
  function setMode(mode) {
    const bulk = mode === "bulk";
    tabSingle.setAttribute("aria-selected", String(!bulk));
    tabBulk.setAttribute("aria-selected", String(bulk));
    singlePanel.hidden = bulk;
    bulkPanel.hidden = !bulk;
    history.replaceState(null, "", bulk ? "/words/add?mode=bulk" : "/words/add");
    (bulk ? bulkInput : single).focus();
  }
  tabSingle.addEventListener("click", () => setMode("single"));
  tabBulk.addEventListener("click", () => setMode("bulk"));

  root.append(
    h("div", { class: "page-head" }, h("h1", { class: "page-title" }, "단어 추가"), h("a", { class: "btn ghost small", href: "/words" }, "단어장")),
    h("div", { class: "seg", role: "tablist", "aria-label": "추가 방식" }, tabSingle, tabBulk),
    singlePanel,
    bulkPanel,
  );
  setMode(query.get("mode") === "bulk" ? "bulk" : "single");
}
