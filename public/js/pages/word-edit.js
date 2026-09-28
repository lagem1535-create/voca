// /words/edit?id=… — 단어 수정 · 삭제
import { h, toast, loading, emptyState, timeAgo } from "../ui.js";
import { wordForm } from "../components/word-form.js";
import { loadWords, updateWord, deleteWord } from "../store.js";
import { termKey } from "../shared/text.js";

export default async function mount(root, { query, navigate, signal }) {
  const id = query.get("id") || "";
  root.append(loading());
  const words = await loadWords();
  if (signal.aborted) return;

  const word = words.find((w) => w.id === id);
  if (!word) {
    root.replaceChildren(emptyState("단어를 찾을 수 없어요", "이미 삭제되었을 수 있어요.", h("a", { class: "btn primary", href: "/words" }, "단어장으로")));
    return;
  }

  const { form } = wordForm({
    initial: word,
    submitLabel: "수정 내용 저장",
    findDuplicate: (term) => {
      const key = termKey(term);
      return words.find((w) => w.id !== id && termKey(w.word) === key) ?? null;
    },
    onSubmit: async (data) => {
      await updateWord(id, data);
      toast("수정했어요.", "success");
      navigate("/words");
    },
    onDelete: async () => {
      if (!confirm(`'${word.word}' 을(를) 삭제할까요?`)) return;
      try {
        await deleteWord(id);
        toast("삭제했어요.");
        navigate("/words", { replace: true });
      } catch (err) {
        toast(err.message, "error");
      }
    },
  });

  root.replaceChildren(
    h("div", { class: "page-head" }, h("h1", { class: "page-title" }, "단어 수정"), h("a", { class: "btn ghost small", href: "/words" }, "단어장")),
    form,
    h(
      "p",
      { class: "muted small center" },
      `맞힘 ${word.correct} · 틀림 ${word.wrong} · 연속 정답 ${word.streak}`,
      word.lastTestedAt ? ` · 마지막 시험 ${timeAgo(word.lastTestedAt)}` : "",
      word.createdAt ? ` · 추가 ${timeAgo(word.createdAt)}` : "",
    ),
  );
}
